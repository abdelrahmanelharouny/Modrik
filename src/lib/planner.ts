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
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { retryableProviderFailure } from "@/lib/security/provider-retry.mjs";
import { logDecision } from "@/lib/journal";
import { getProvider, type ChatMessage } from "@/lib/providers";
import { PROMPT_VERSION } from "@/lib/agents";
import { filterEvidenceForAI, isHumanStakeholderAnswer, hasHumanQuestionDecision, evidenceContentBudget } from "@/lib/security/data-safety.mjs";
import { selectByUtility, selectDistinctPoolIndices, clampSignalScore, deduplicateQuestions, pickSeededIndices } from "@/lib/planner/selection.mjs";
export { selectByUtility } from "@/lib/planner/selection.mjs";


const plannerPoolSchema = z.object({
  questions: z.array(z.object({
    text: z.string().trim().min(1).max(600),
    rationale: z.string().max(600).catch(""),
    priority: z.enum(["high", "medium", "low"]).catch("medium"),
    askCost: z.number().int().min(1).max(5).catch(3),
    fallbackAssumption: z.string().max(400).catch(""),
    language: z.enum(["en", "ar-EG", "codeswitch"]).catch("en"),
  })).max(30),
});

const plannerScoresSchema = z.object({
  scores: z.array(z.object({
    index: z.number().int().min(1),
    infoGain: z.number().min(1).max(5),
    impact: z.number().min(1).max(5),
    uncertainty: z.number().min(1).max(5),
    risk: z.number().min(1).max(5),
  })).max(100),
});

const plannerJudgeSchema = z.object({
  evidenceCoverage: z.number().min(0).max(100),
  redundancyRate: z.number().min(0).max(100),
  dialectFit: z.number().min(0).max(100),
});

const plannerSelectionSchema = z.object({
  selected: z.array(z.number().int().min(1)).max(30),
});

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
  } catch (err) {
    if (!retryableProviderFailure(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
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

async function callLLMJson<T>(systemBase: string, userPrompt: string, usage: UsageAcc, schema: z.ZodType<T>): Promise<T> {
  let lastErr: unknown = new Error("Planner: unparseable output");
  for (let i = 0; i < 2; i++) {
    const raw = await callLLM(systemBase, userPrompt, usage);
    try {
      return schema.parse(parseJson<unknown>(raw));
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

function evidenceBlock(evidences: { code: string; title: string; sourceType: string; language: string; content: string; consent?: boolean; origin?: string }[]): string {
  const eligible = filterEvidenceForAI(evidences);
  if (!eligible.length) {
    return evidences.length
      ? "(evidence sources are stored, but none has explicit permission for AI processing; no source content is sent to the model)"
      : "(no evidence sources provided yet)";
  }
  const per = evidenceContentBudget(eligible.length, 16000, 4000);
  return eligible
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
  const memoryLessons = await db.memoryEntry.findMany({ where: { projectId, kind: "lesson" }, orderBy: { createdAt: "desc" }, take: 4 });
  const memory = memoryLessons.length
    ? `\nPROJECT-SCOPED LESSONS:\n${memoryLessons.map((l) => `- ${l.term}: ${l.detail}`).join("\n")}\n`
    : "";
  const answered = project.questions
    .filter(isHumanStakeholderAnswer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");
  const context = `PROJECT BRIEF:\n${project.brief?.trim() || "(empty brief)"}\n${memory}\nEVIDENCE SOURCES:\n${evidenceBlock(project.evidences)}\n\nSTAKEHOLDER ANSWERS SO FAR:\n${answered || "(none yet)"}\n${uncertaintyLedger(project.questions)}`;

  const prompt = `${context}
TASK: Generate ${count} DISTINCT candidate clarifying questions for this project (a wide pool — breadth matters more than final ordering). Cover: scope boundaries, users/roles, constraints, quality attributes, data & privacy, success criteria, integration points, and risks. Prioritize unknowns the evidence leaves open.

LANGUAGE POLICY (Arabic-native-first, N7): when the evidence contains Egyptian Arabic or code-switched content, write questions targeting those stakeholders natively in Egyptian Arabic exactly as they speak; mirror code-switching where the sources code-switch.

For each candidate: estimate askCost (1=trivial, 5=very costly interruption) and a testable fallbackAssumption (what we'd assume if skipped) in the question's own language.

Return JSON: {"questions": [{"text": "...", "rationale": "...", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "...", "language": "ar-EG|codeswitch|en"}]}`;

  const out = await callLLMJson<PoolOut>(SYSTEM, prompt, usage, plannerPoolSchema);
  const pool = deduplicateQuestions((out.questions ?? [])
    .filter((q) => q && String(q.text ?? "").trim())
    .map((q) => ({
      text: String(q.text).slice(0, 600),
      rationale: String(q.rationale ?? "").slice(0, 600),
      priority: (["high", "medium", "low"].includes(q.priority) ? q.priority : "medium") as PlannedQuestion["priority"],
      askCost: Math.min(5, Math.max(1, Math.round(Number(q.askCost) || 3))),
      fallbackAssumption: String(q.fallbackAssumption ?? "").slice(0, 400),
      language: ["en", "ar-EG", "codeswitch"].includes(String(q.language)) ? String(q.language) : "en",
    }))).slice(0, count);
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
    usage,
    plannerScoresSchema
  );
  return questions.map((q, i) => {
    const s = (out.scores ?? []).find((x) => Number(x.index) === i + 1);
    if (!s) {
      const base = { infoGain: 3, impact: 3, uncertainty: 3, risk: 3, askCost: q.askCost };
      return { ...q, utility: { ...base, utility: computeUtility(base) } };
    }
    const base = {
      infoGain: clampSignalScore(s.infoGain),
      impact: clampSignalScore(s.impact),
      uncertainty: clampSignalScore(s.uncertainty),
      risk: clampSignalScore(s.risk),
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

  const out = await callLLMJson<{ evidenceCoverage: number; redundancyRate: number; dialectFit: number }>(SYSTEM, prompt, usage, plannerJudgeSchema);
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
  const existingQuestions = await db.question.findMany({
    where: { projectId },
    select: { answered: true, answer: true, answerSource: true, resolution: true },
  });
  if (hasHumanQuestionDecision(existingQuestions)) {
    throw new Error("Refusing to overwrite elicitation questions: human answers or uncertainty decisions already exist.");
  }
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
      .filter(isHumanStakeholderAnswer)
      .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
      .join("\n\n");
    context = `PROJECT BRIEF:\n${project.brief?.trim() || "(empty brief)"}\nEVIDENCE SOURCES:\n${evidenceBlock(project.evidences)}\n\nSTAKEHOLDER ANSWERS:\n${answered || "(none yet)"}\n${uncertaintyLedger(project.questions)}`;
    const prompt = `${context}
TASK: Identify the 5 most important clarifying questions to ask the stakeholders now. For each, estimate askCost (1-5) and a testable fallbackAssumption.
Return JSON: {"questions": [{"text": "...", "rationale": "...", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "...", "language": "ar-EG|codeswitch|en"}]}`;
    const out = await callLLMJson<PoolOut>(SYSTEM, prompt, usage, plannerPoolSchema);
    selected = deduplicateQuestions((out.questions ?? []).map((q) => ({
      text: String(q.text ?? "").slice(0, 600),
      rationale: String(q.rationale ?? "").slice(0, 600),
      priority: (["high", "medium", "low"].includes(q.priority) ? q.priority : "medium") as PlannedQuestion["priority"],
      askCost: Math.min(5, Math.max(1, Math.round(Number(q.askCost) || 3))),
      fallbackAssumption: String(q.fallbackAssumption ?? "").slice(0, 400),
      language: ["en", "ar-EG", "codeswitch"].includes(String(q.language)) ? String(q.language) : "en",
    }))).slice(0, 5);
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
      const out = await callLLMJson<{ selected: number[] }>(SYSTEM, prompt, usage, plannerSelectionSchema);
      const idxs = selectDistinctPoolIndices(out.selected ?? [], pool.length, 5);
      if (!idxs.length) {
        throw new Error("Planner returned no valid, distinct candidate indices; refusing to silently substitute the entire pool.");
      }
      selected = idxs.map((i) => pool[i]);
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

  if (!selected.length) {
    throw new Error("Planner produced no valid questions. Existing live questions were preserved.");
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
  await db.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { projectId } });
    for (const [i, question] of selected.entries()) {
      await tx.question.create({
        data: {
          projectId,
          order: i,
          text: question.text,
          rationale: question.rationale,
          priority: question.priority,
          askCost: question.askCost,
          fallbackAssumption: question.fallbackAssumption || null,
          utility: question.utility ? JSON.stringify(question.utility) : null,
        },
      });
    }
  });
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


export interface PlannerExperimentArmResult {
  arm: PlannerArm;
  questions: PlannedQuestion[];
  metrics: ArmMetrics;
  candidates: number;
  estTokens: number;
  latencyMs: number;
}

export interface PlannerExperimentResult {
  experimentId: string;
  seed: string;
  materializedArm: PlannerArm;
  candidatePoolHash: string;
  candidateCount: number;
  arms: PlannerExperimentArmResult[];
}

function usageTotal(...values: UsageAcc[]): UsageAcc {
  return values.reduce(
    (total, value) => ({
      calls: total.calls + value.calls,
      latencyMs: total.latencyMs + value.latencyMs,
      estTokens: total.estTokens + value.estTokens,
    }),
    newUsage()
  );
}

function makeDirectPrompt(context: string) {
  return `${context}
TASK: Identify the 5 most important clarifying questions to ask the stakeholders now. For each, estimate askCost (1-5) and a testable fallbackAssumption.
Return JSON: {"questions": [{"text": "...", "rationale": "...", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "...", "language": "ar-EG|codeswitch|en"}]}`;
}

/**
 * Runs a reproducible four-arm study.
 * random / llm / impact_aware share one immutable candidate pool and one
 * shared signal-scoring pass. single_shot is intentionally a direct-generation
 * baseline and is explicitly not described as selecting from that pool.
 */
export async function runPlannerExperiment(
  projectId: string,
  options: { seed?: string; materializeArm?: PlannerArm; runId?: string } = {}
): Promise<PlannerExperimentResult> {
  const materializeArm = options.materializeArm ?? "impact_aware";
  if (!ARMS.includes(materializeArm)) throw new Error("Unknown materialized planner arm.");
  const seed = String(options.seed ?? randomUUID()).trim().slice(0, 120);
  if (!seed) throw new Error("Planner experiment seed must not be empty.");

  const existingQuestions = await db.question.findMany({
    where: { projectId },
    select: { answered: true, answer: true, answerSource: true, resolution: true },
  });
  if (hasHumanQuestionDecision(existingQuestions)) {
    throw new Error("Refusing to overwrite elicitation questions: human answers or uncertainty decisions already exist.");
  }

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { id: true, currentStage: true, status: true },
  });
  if (project.status === "complete" || project.currentStage !== "ELICITATION") {
    throw new Error("A planner experiment can only run during the ELICITATION stage.");
  }

  const experimentId = randomUUID();
  const sharedUsage = newUsage();
  const { pool, context } = await generatePool(projectId, sharedUsage, 12);
  if (pool.length < 5) {
    throw new Error("The common candidate pool contains fewer than five distinct questions. No experiment was recorded.");
  }

  // This scoring pass is shared by all three pool-based arms, so they receive
  // exactly the same question text, ask-cost and signal values.
  const scoredPool = await scoreSignals(context, pool, sharedUsage);
  const commonPoolJson = JSON.stringify(scoredPool);
  const candidatePoolHash = createHash("sha256").update(commonPoolJson).digest("hex");

  const armUsages: Record<PlannerArm, UsageAcc> = {
    single_shot: newUsage(),
    random: newUsage(),
    llm: newUsage(),
    impact_aware: newUsage(),
  };

  const singleShotProject = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true },
  });
  const answered = singleShotProject.questions
    .filter(isHumanStakeholderAnswer)
    .map((question) => `Q: ${question.text}\nA: ${question.answer}`)
    .join("\n\n");
  const singleShotContext =
    `PROJECT BRIEF:\n${singleShotProject.brief?.trim() || "(empty brief)"}\nEVIDENCE SOURCES:\n${evidenceBlock(singleShotProject.evidences)}\n\nSTAKEHOLDER ANSWERS:\n${answered || "(none yet)"}\n${uncertaintyLedger(singleShotProject.questions)}`;
  const directOut = await callLLMJson<PoolOut>(
    SYSTEM,
    makeDirectPrompt(singleShotContext),
    armUsages.single_shot,
    plannerPoolSchema
  );
  const singleShotQuestions = deduplicateQuestions((directOut.questions ?? []).map((question) => ({
    text: question.text,
    rationale: question.rationale ?? "",
    priority: question.priority,
    askCost: question.askCost,
    fallbackAssumption: question.fallbackAssumption ?? "",
    language: question.language ?? "en",
  }))).slice(0, 5);
  if (!singleShotQuestions.length) {
    throw new Error("single_shot returned no valid questions. No experiment was recorded.");
  }
  const scoredSingleShot = await scoreSignals(singleShotContext, singleShotQuestions, armUsages.single_shot);

  const randomIndices = pickSeededIndices(scoredPool.length, 5, seed);
  const randomQuestions = randomIndices.map((index) => scoredPool[index]);

  const llmPrompt = `${context}
CANDIDATE POOL (these exact candidates are shared by the random and impact_aware arms):
${scoredPool.map((question, index) => `${index + 1}. ${question.text} (askCost ${question.askCost})`).join("\n")}

TASK: Select the 5 BEST questions from this exact pool for the next interview round. Return only distinct indices. Do not invent or rewrite questions.
Return JSON: {"selected": [3, 7, 1, 11, 5]}`;
  const llmOut = await callLLMJson<{ selected: number[] }>(
    SYSTEM,
    llmPrompt,
    armUsages.llm,
    plannerSelectionSchema
  );
  const llmIndices = selectDistinctPoolIndices(llmOut.selected, scoredPool.length, 5);
  if (llmIndices.length < 1) {
    throw new Error("The LLM arm returned no valid candidate indices. No experiment was recorded.");
  }
  const llmQuestions = llmIndices.map((index) => scoredPool[index]);

  const impactQuestions = selectByUtility(scoredPool, 5, 15);
  if (!impactQuestions.length) {
    throw new Error("The impact_aware arm could not select within its cost budget. No experiment was recorded.");
  }

  const selectedByArm: Record<PlannerArm, PlannedQuestion[]> = {
    single_shot: scoredSingleShot,
    random: randomQuestions,
    llm: llmQuestions,
    impact_aware: impactQuestions,
  };

  const order: PlannerArm[] = ["single_shot", "random", "llm", "impact_aware"];
  const results: PlannerExperimentArmResult[] = [];
  const persistence: Prisma.PlannerRunUncheckedCreateInput[] = [];

  for (const arm of order) {
    const ownUsage = armUsages[arm];
    const questions = selectedByArm[arm];
    const metrics = await judgeArm(
      arm === "single_shot" ? singleShotContext : context,
      questions,
      ownUsage
    );
    // Common-pool generation + signal scoring is charged equally across the
    // three pool-based arms; the direct baseline does not inherit that cost.
    const sharedAllocation = arm === "single_shot" ? 0 : Math.ceil(sharedUsage.estTokens / 3);
    const estimatedTokens = ownUsage.estTokens + sharedAllocation;
    const allocatedLatency = ownUsage.latencyMs +
      (arm === "single_shot" ? 0 : Math.ceil(sharedUsage.latencyMs / 3));
    results.push({
      arm,
      questions,
      metrics,
      candidates: pool.length,
      estTokens: estimatedTokens,
      latencyMs: allocatedLatency,
    });
    persistence.push({
      projectId,
      arm,
      experimentId,
      seed,
      candidatePool: commonPoolJson.slice(0, 18000),
      candidatePoolHash,
      candidatePoolUsed: arm !== "single_shot",
      questions: JSON.stringify(questions).slice(0, 18000),
      metrics: JSON.stringify(metrics),
      candidates: pool.length,
      latencyMs: allocatedLatency,
      estTokens: estimatedTokens,
      promptVersion: PROMPT_VERSION,
    });
  }

  const materialized = results.find((result) => result.arm === materializeArm);
  if (!materialized) throw new Error("The selected materialized arm is missing from the experiment.");

  const totalUsage = usageTotal(sharedUsage, ...Object.values(armUsages));
  await db.$transaction(async (tx) => {
    for (const data of persistence) {
      await tx.plannerRun.create({ data });
    }
    await tx.question.deleteMany({ where: { projectId } });
    for (const [index, question] of materialized.questions.entries()) {
      await tx.question.create({
        data: {
          projectId,
          order: index,
          text: question.text,
          rationale: question.rationale,
          priority: question.priority,
          askCost: question.askCost,
          fallbackAssumption: question.fallbackAssumption || null,
          utility: question.utility ? JSON.stringify(question.utility) : null,
        },
      });
    }
    await tx.artifact.create({
      data: {
        projectId,
        stage: "PLANNER",
        kind: "json",
        content: JSON.stringify({
          experimentId,
          seed,
          materializedArm: materializeArm,
          candidatePoolHash,
          commonPool: scoredPool,
          sharedUsage,
          totalUsage,
          arms: results,
          design: {
            poolBasedArms: ["random", "llm", "impact_aware"],
            singleShotIsDirectBaseline: true,
            sharedSignalScores: true,
          },
        }).slice(0, 60000),
      },
    });
  });

  await logDecision(
    projectId,
    "ELICITATION",
    "agent",
    "planner_experiment",
    `Experiment ${experimentId} seed=${seed}; shared pool ${pool.length}; four arms; materialized ${materializeArm}; pool hash ${candidatePoolHash.slice(0, 12)}.`
  );

  if (options.runId) {
    try {
      await db.pipelineRun.update({
        where: { id: options.runId },
        data: {
          latencyMs: totalUsage.latencyMs,
          estTokens: totalUsage.estTokens,
          estCostUsd: +(totalUsage.estTokens * 0.0000006).toFixed(6),
          promptVersion: PROMPT_VERSION,
          log: `planner-experiment:${experimentId};seed:${seed}`,
        },
      });
    } catch {
      // Pipeline outcome remains authoritative even if observatory metadata fails.
    }
  }

  return {
    experimentId,
    seed,
    materializedArm: materializeArm,
    candidatePoolHash,
    candidateCount: pool.length,
    arms: results,
  };
}
