// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — IMPACT-AWARE QUESTION PLANNER (dev item 7)
// The research heart of the platform.
//
//   Utility = (InformationGain × DownstreamImpact × Uncertainty × Risk)
//             ÷ AskingCost
//
// 4-arm ablation, identical judging for every arm:
//   single_shot  — one classic "give 5 questions" LLM call
//   random       — 12-candidate pool, 5 picked uniformly at random
//   llm          — pool + the LLM self-selects its best 5
//   impact_aware — pool + per-question signal scoring + the utility
//                  formula with an ask-cost budget (OURS)
//
// 5 judge metrics (same judge prompt & scorer for all arms):
//   avgUtility, utilityPerCost, evidenceCoverage, redundancyRate,
//   dialectFit (Arabic-native fit, N7)
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { getProvider, type ChatMessage } from "@/lib/providers";
import { PROMPT_VERSION } from "@/lib/agents";

export type PlannerArm = "single_shot" | "random" | "llm" | "impact_aware";

export const ARMS: PlannerArm[] = ["single_shot", "random", "llm", "impact_aware"];

export interface UtilityBreakdown {
  infoGain: number; // 1..5 — how much answering reduces unknowns
  impact: number; // 1..5 — how many downstream decisions this touches
  uncertainty: number; // 1..5 — how uncertain the team currently is
  risk: number; // 1..5 — cost of carrying a wrong assumption
  askCost: number; // 1..5 — stakeholder interruption cost
  utility: number; // computed formula value (max 625/1)
}

export interface PlannedQuestion {
  text: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  askCost: number;
  fallbackAssumption: string;
  language?: string;
  utility?: UtilityBreakdown;
}

export interface ArmMetrics {
  avgUtility: number;
  utilityPerCost: number;
  evidenceCoverage: number; // 0..100
  redundancyRate: number; // 0..100 (lower is better)
  dialectFit: number; // 0..100
}

interface UsageAcc {
  calls: number;
  latencyMs: number;
  estTokens: number;
}

function newUsage(): UsageAcc {
  return { calls: 0, latencyMs: 0, estTokens: 0 };
}

// Fixed strategy — mirrors agents.ts callLLM (retry + usage accounting)
async function callLLM(systemBase: string, userPrompt: string, usage: UsageAcc): Promise<string> {
  const provider = await getProvider();
  const messages: ChatMessage[] = [
    { role: "system", content: systemBase },
    { role: "user", content: userPrompt },
  ];
  const t0 = Date.now();
  let content: string;
  try {
    content = await provider.complete(messages);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    content = await provider.complete(messages);
  }
  usage.calls += 1;
  usage.latencyMs += Date.now() - t0;
  usage.estTokens += Math.ceil((userPrompt.length + content.length) / 4);
  return content;
}

function parseJson<T>(raw: string): T {
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  try {
    return JSON.parse(text) as T;
  } catch {
    const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (lastBrace > 0) {
      try {
        return JSON.parse(text.slice(0, lastBrace + 1)) as T;
      } catch {
        /* fall through */
      }
    }
  }
  throw new Error("Planner: unparseable LLM output");
}

async function callLLMJson<T>(systemBase: string, userPrompt: string, usage: UsageAcc): Promise<T> {
  let lastErr: unknown = new Error("Planner: unparseable output");
  for (let i = 0; i < 2; i++) {
    const raw = await callLLM(systemBase, userPrompt, usage);
    try {
      return parseJson<T>(raw);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const SYSTEM =
  "You are the Question Planner inside Modrik (مدرك), an evidence-based, human-in-the-loop " +
  "requirements engineering assistant. You are precise and ground every question in the provided " +
  "evidence. Reply with VALID JSON ONLY — no markdown fences, no commentary.";

function evidenceBlock(evidences: { code: string; title: string; sourceType: string; language: string; content: string }[]): string {
  if (!evidences.length) return "(no evidence sources provided yet)";
  const TOTAL_BUDGET = 16000;
  const PER_MAX = 4000;
  const total = evidences.reduce((s, e) => s + e.content.length, 0);
  const per = total > TOTAL_BUDGET ? Math.max(1200, Math.floor(TOTAL_BUDGET / evidences.length)) : PER_MAX;
  return evidences
    .map((e) => {
      const body =
        e.content.length > per
          ? `${e.content.slice(0, per)}\n[…truncated for this stage — ${e.content.length - per} more characters exist]`
          : e.content;
      return `[${e.code}] (${e.sourceType}, language: ${e.language}) "${e.title}"\n${body}`;
    })
    .join("\n\n");
}

function uncertaintyLedger(questions: { text: string; fallbackAssumption: string | null; resolution: string }[]): string {
  const decided = questions.filter((q) => q.resolution === "proceed_with_uncertainty" && q.fallbackAssumption);
  if (!decided.length) return "";
  return `\nUNCERTAINTY LEDGER (assumptions already carried without asking):\n${decided
    .map((q) => `- Assume: ${q.fallbackAssumption} (instead of asking: "${q.text.slice(0, 120)}")`)
    .join("\n")}\n`;
}

// ── The utility formula (deterministic, registry-of-signals driven) ──

export function computeUtility(s: Omit<UtilityBreakdown, "utility">): number {
  const clamp = (n: number) => Math.min(5, Math.max(1, n));
  const ig = clamp(s.infoGain);
  const im = clamp(s.impact);
  const un = clamp(s.uncertainty);
  const ri = clamp(s.risk);
  const ac = clamp(s.askCost);
  return +(((ig * im * un * ri) / ac) / 1).toFixed(2);
}

// ── Candidate pool generation (shared by random / llm / impact_aware) ──

interface PoolOut {
  questions: PlannedQuestion[];
}

async function generatePool(
  projectId: string,
  usage: UsageAcc,
  count = 12
): Promise<{ pool: PlannedQuestion[]; context: string }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true },
  });
  const memoryLessons = await db.memoryEntry.findMany({ where: { kind: "lesson" }, orderBy: { createdAt: "desc" }, take: 4 });
  const memory = memoryLessons.length
    ? `\nCROSS-PROJECT LESSONS:\n${memoryLessons.map((l) => `- ${l.term}: ${l.detail}`).join("\n")}\n`
    : "";
  const answered = project.questions
    .filter((q) => q.answered && q.answer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");
  const context = `PROJECT BRIEF:\n${project.brief?.trim() || "(empty brief)"}\n${memory}\nEVIDENCE SOURCES:\n${evidenceBlock(project.evidences)}\n\nSTAKEHOLDER ANSWERS SO FAR:\n${answered || "(none yet)"}\n${uncertaintyLedger(project.questions)}`;

  const prompt = `${context}
TASK: Generate ${count} DISTINCT candidate clarifying questions for this project (a wide pool — breadth matters more than final ordering). Cover: scope boundaries, users/roles, constraints, quality attributes, data & privacy, success criteria, integration points, and risks. Prioritize unknowns the evidence leaves open.

LANGUAGE POLICY (Arabic-native-first, N7): when the evidence contains Egyptian Arabic or code-switched content, write questions targeting those stakeholders natively in Egyptian Arabic exactly as they speak; mirror code-switching where the sources code-switch.

For each candidate: estimate askCost (1=trivial, 5=very costly interruption) and a testable fallbackAssumption (what we'd assume if skipped) in the question's own language.

Return JSON: {"questions": [{"text": "...", "rationale": "...", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "...", "language": "ar-EG|codeswitch|en"}]}`;

  const out = await callLLMJson<PoolOut>(SYSTEM, prompt, usage);
  const pool = (out.questions ?? [])
    .filter((q) => q && String(q.text ?? "").trim())
    .slice(0, count)
    .map((q) => ({
      text: String(q.text).slice(0, 600),
      rationale: String(q.rationale ?? "").slice(0, 600),
      priority: (["high", "medium", "low"].includes(q.priority) ? q.priority : "medium") as PlannedQuestion["priority"],
      askCost: Math.min(5, Math.max(1, Math.round(Number(q.askCost) || 3))),
      fallbackAssumption: String(q.fallbackAssumption ?? "").slice(0, 400),
      language: ["en", "ar-EG", "codeswitch"].includes(String(q.language)) ? String(q.language) : "en",
    }));
  return { pool, context };
}

// ── Signal scoring (same scorer for every arm — fairness contract) ──

async function scoreSignals(
  context: string,
  questions: PlannedQuestion[],
  usage: UsageAcc
): Promise<PlannedQuestion[]> {
  if (!questions.length) return questions;
  const prompt = `${context}
CANDIDATE QUESTIONS TO SCORE:
${questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}

TASK: Score each question on four signals, 1-5 each, judging ONLY from the evidence and project state above:
- infoGain: how much the answer would reduce what the team does not know
- impact: how many downstream requirement decisions this answer touches
- uncertainty: how uncertain the team currently is about this specific topic
- risk: how costly a WRONG assumption would be if the question were skipped
(Be strict: use the full 1-5 range, most questions are not 5s.)

Return JSON: {"scores": [{"index": 1, "infoGain": 4, "impact": 3, "uncertainty": 4, "risk": 2}]}`;

  const out = await callLLMJson<{ scores: { index: number; infoGain: number; impact: number; uncertainty: number; risk: number }[] }>(
    SYSTEM,
    prompt,
    usage
  );
  return questions.map((q, i) => {
    const s = (out.scores ?? []).find((x) => Number(x.index) === i + 1);
    if (!s) {
      const base = { infoGain: 3, impact: 3, uncertainty: 3, risk: 3, askCost: q.askCost };
      return { ...q, utility: { ...base, utility: computeUtility(base) } };
    }
    const base = {
      infoGain: Math.round(Number(s.infoGain) || 3),
      impact: Math.round(Number(s.impact) || 3),
      uncertainty: Math.round(Number(s.uncertainty) || 3),
      risk: Math.round(Number(s.risk) || 3),
      askCost: q.askCost,
    };
    return { ...q, utility: { ...base, utility: computeUtility(base) } };
  });
}

// ── Arm implementations ──────────────────────────────────────

function pickRandom<T>(arr: T[], k: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length && out.length < k) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

// Budget-constrained greedy selection on the utility formula (impact_aware arm)
export function selectByUtility(pool: PlannedQuestion[], k = 5, costBudget = 15): PlannedQuestion[] {
  const scored = pool
    .filter((q) => q.utility)
    .sort((a, b) => (b.utility!.utility ?? 0) - (a.utility!.utility ?? 0));
  const picked: PlannedQuestion[] = [];
  let cost = 0;
  for (const q of scored) {
    if (picked.length >= k) break;
    if (cost + q.askCost > costBudget) continue;
    picked.push(q);
    cost += q.askCost;
  }
  // relax the budget if the tight constraint left us underfilled
  for (const q of scored) {
    if (picked.length >= k) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked.slice(0, k);
}

// ── Judge (identical for all arms) ───────────────────────────

async function judgeArm(context: string, questions: PlannedQuestion[], usage: UsageAcc): Promise<ArmMetrics> {
  const withUtility = questions.map((q) => ({ ...q, utility: q.utility ?? undefined }));
  const avgUtility = withUtility.length
    ? +(withUtility.reduce((s, q) => s + (q.utility?.utility ?? 0), 0) / withUtility.length).toFixed(1)
    : 0;
  const totalCost = withUtility.reduce((s, q) => s + q.askCost, 0);
  const utilityPerCost = totalCost ? +(withUtility.reduce((s, q) => s + (q.utility?.utility ?? 0), 0) / totalCost).toFixed(2) : 0;

  const prompt = `${context}
QUESTION SET UNDER EVALUATION:
${questions.map((q, i) => `${i + 1}. ${q.text}`).join("\n")}

TASK: Judge this clarifying-question set on exactly three dimensions, strictly 0-100:
- evidenceCoverage: what percentage of the DISTINCT unknown topics present in the evidence does this set probe? (a set that ignores whole evidence themes scores low)
- redundancyRate: what percentage of the questions substantially duplicate another question's topic? (0 = every question probes a different unknown)
- dialectFit: what percentage of the questions are written in the stakeholder's own language style — native Egyptian Arabic for Arabic-evidence stakeholders, code-switching where sources code-switch? (if all evidence is English, high fit means English)
Be strict and numeric.

Return JSON: {"evidenceCoverage": 62, "redundancyRate": 10, "dialectFit": 80}`;

  const out = await callLLMJson<{ evidenceCoverage: number; redundancyRate: number; dialectFit: number }>(SYSTEM, prompt, usage);
  const pct = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));
  return {
    avgUtility,
    utilityPerCost,
    evidenceCoverage: pct(out.evidenceCoverage),
    redundancyRate: pct(out.redundancyRate),
    dialectFit: pct(out.dialectFit),
  };
}

// ── Public entry: run one arm ────────────────────────────────

export async function runPlanner(
  projectId: string,
  arm: PlannerArm,
  runId?: string
): Promise<{ arm: PlannerArm; questions: PlannedQuestion[]; metrics: ArmMetrics; candidates: number }> {
  const usage = newUsage();
  let selected: PlannedQuestion[] = [];
  let candidates = 0;
  let context = "";

  if (arm === "single_shot") {
    // Classic baseline: one direct call, no pool, no formula.
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { evidences: true, questions: true },
    });
    const answered = project.questions
      .filter((q) => q.answered && q.answer)
      .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
      .join("\n\n");
    context = `PROJECT BRIEF:\n${project.brief?.trim() || "(empty brief)"}\nEVIDENCE SOURCES:\n${evidenceBlock(project.evidences)}\n\nSTAKEHOLDER ANSWERS:\n${answered || "(none yet)"}\n${uncertaintyLedger(project.questions)}`;
    const prompt = `${context}
TASK: Identify the 5 most important clarifying questions to ask the stakeholders now. For each, estimate askCost (1-5) and a testable fallbackAssumption.
Return JSON: {"questions": [{"text": "...", "rationale": "...", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "...", "language": "ar-EG|codeswitch|en"}]}`;
    const out = await callLLMJson<PoolOut>(SYSTEM, prompt, usage);
    selected = (out.questions ?? []).slice(0, 5).map((q) => ({
      text: String(q.text ?? "").slice(0, 600),
      rationale: String(q.rationale ?? "").slice(0, 600),
      priority: (["high", "medium", "low"].includes(q.priority) ? q.priority : "medium") as PlannedQuestion["priority"],
      askCost: Math.min(5, Math.max(1, Math.round(Number(q.askCost) || 3))),
      fallbackAssumption: String(q.fallbackAssumption ?? "").slice(0, 400),
      language: ["en", "ar-EG", "codeswitch"].includes(String(q.language)) ? String(q.language) : "en",
    }));
  } else {
    const { pool, context: ctx } = await generatePool(projectId, usage);
    candidates = pool.length;
    context = ctx;
    if (arm === "random") {
      selected = pickRandom(pool, 5);
    } else if (arm === "llm") {
      const prompt = `${context}
CANDIDATE POOL:
${pool.map((q, i) => `${i + 1}. ${q.text} (askCost ${q.askCost})`).join("\n")}

TASK: Select the 5 BEST questions from this pool for the next interview round — the ones whose answers most change what the team builds. Return ONLY their indices.
Return JSON: {"selected": [3, 7, 1, 11, 5]}`;
      const out = await callLLMJson<{ selected: number[] }>(SYSTEM, prompt, usage);
      const idxs = (out.selected ?? []).map((n) => Number(n) - 1).filter((n) => n >= 0 && n < pool.length);
      selected = (idxs.length ? idxs : pool.map((_, i) => i)).slice(0, 5).map((i) => pool[i]);
    } else {
      // impact_aware — signal-score the whole pool, then the formula decides.
      const scored = await scoreSignals(context, pool, usage);
      selected = selectByUtility(scored, 5, 15);
    }
  }

  // Fair comparison: signal-score the FINAL set of every arm that has no
  // utilities yet (single_shot / random / llm), so avgUtility is judged
  // by the same scorer everywhere.
  if (!selected.every((q) => q.utility)) {
    selected = await scoreSignals(context, selected, usage);
  }

  const metrics = await judgeArm(context, selected, usage);

  // Persist the ablation record
  await db.plannerRun.create({
    data: {
      projectId,
      arm,
      questions: JSON.stringify(selected).slice(0, 18000),
      metrics: JSON.stringify(metrics),
      candidates,
      latencyMs: usage.latencyMs,
      estTokens: usage.estTokens,
      promptVersion: PROMPT_VERSION,
    },
  });

  // Materialise as the live question set (same contract as stage 1) with
  // the utility breakdown stored per question (dynamicity: UI reads these).
  await db.question.deleteMany({ where: { projectId } });
  await db.$transaction(
    selected.map((q, i) =>
      db.question.create({
        data: {
          projectId,
          order: i,
          text: q.text,
          rationale: q.rationale,
          priority: q.priority,
          askCost: q.askCost,
          fallbackAssumption: q.fallbackAssumption || null,
          utility: q.utility ? JSON.stringify(q.utility) : null,
        },
      })
    )
  );
  await db.artifact.create({
    data: {
      projectId,
      stage: "PLANNER",
      kind: "json",
      content: JSON.stringify({ arm, candidates, selected, metrics }).slice(0, 20000),
    },
  });
  await logDecision(
    projectId,
    "ELICITATION",
    "agent",
    "planner_run",
    `Question Planner arm=${arm} selected ${selected.length}/${candidates || selected.length} candidates — avgUtility ${metrics.avgUtility}, coverage ${metrics.evidenceCoverage}%, redundancy ${metrics.redundancyRate}%.`
  );
  if (runId) {
    try {
      await db.pipelineRun.update({
        where: { id: runId },
        data: {
          latencyMs: usage.latencyMs,
          estTokens: usage.estTokens,
          estCostUsd: +(usage.estTokens * 0.0000006).toFixed(6),
          promptVersion: PROMPT_VERSION,
          log: `provider-planner:${arm}`,
        },
      });
    } catch {
      /* best-effort */
    }
  }
  return { arm, questions: selected, metrics, candidates };
}
