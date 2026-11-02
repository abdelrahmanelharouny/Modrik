// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — agent stage runners (server-side only)
// Expansion build:
//   I1  ask-vs-proceed signals (askCost + fallbackAssumption)
//   I2  confidence values per requirement (calibration input)
//   I3  critic-verifier pass (Propose → Verify → Human arbitrates)
//   I4  project-scoped memory re-injection + harvest
//   I7  synthetic stakeholder wind tunnel (persona + held-out secret)
//   I8  drift radar over the requirement graph
//   I11 compliance / NFR constraint pack checks
//   I13 per-call latency + token estimates recorded per run
//   I14 requirements health report
//   G4  structured state re-injection between stages
//   G6  prompt version recorded on every run
// ─────────────────────────────────────────────────────────────
import ZAI from "z-ai-web-dev-sdk";
import { z } from "zod";
import { retryableProviderFailure } from "@/lib/security/provider-retry.mjs"; // retained for direct SDK consumers; agent calls flow through providers.ts
import { db } from "@/lib/db";
import { filterEvidenceForAI, isHumanStakeholderAnswer, hasHumanQuestionDecision, hasHumanCandidateEdits, evidenceContentBudget } from "@/lib/security/data-safety.mjs";
import { logDecision } from "@/lib/journal";
import { getProvider, type ChatMessage } from "@/lib/providers";
import type { Stage } from "@/lib/rp";

export const PROMPT_VERSION = "v2.1-audit";

// ---------- LLM plumbing ----------

const SYSTEM_BASE =
  "You are part of Modrik (مدرك), an evidence-based, human-in-the-loop " +
  "requirements engineering assistant. You are precise, conservative and " +
  "ground every statement in the provided evidence. Reply with VALID JSON ONLY — " +
  "no markdown fences, no commentary before or after the JSON.";

interface UsageAcc {
  calls: number;
  latencyMs: number;
  estTokens: number;
  provider?: string; // which model served the calls (observatory)
}

function newUsage(): UsageAcc {
  return { calls: 0, latencyMs: 0, estTokens: 0 };
}

const questionsOutputSchema = z.object({
  questions: z.array(z.object({
    text: z.string().trim().min(1).max(600),
    rationale: z.string().max(600).catch(""),
    priority: z.enum(["high", "medium", "low"]).catch("medium"),
    askCost: z.number().int().min(1).max(5).catch(3),
    fallbackAssumption: z.string().max(400).catch(""),
  })).max(20),
});

const candidatesOutputSchema = z.object({
  candidates: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(1000).catch(""),
    evidenceCodes: z.array(z.string().max(80)).max(30).catch([]),
    suggestedImpact: z.number().min(1).max(5).catch(3),
    suggestedEffort: z.number().min(1).max(5).catch(3),
  })).max(12),
});

const requirementsOutputSchema = z.object({
  requirements: z.array(z.object({
    text: z.string().trim().min(1).max(800),
    type: z.enum(["functional", "nonfunctional", "constraint"]).catch("functional"),
    priority: z.enum(["Must", "Should", "Could", "Won't"]).catch("Should"),
    evidenceCodes: z.array(z.string().max(80)).max(30).catch([]),
    confidence: z.number().min(0).max(100).catch(60),
    language: z.enum(["en", "ar-EG", "codeswitch"]).catch("en"),
  })).max(30),
});

const verdictsOutputSchema = z.object({
  verdicts: z.array(z.object({
    refId: z.string().trim().min(1).max(40),
    verdict: z.enum(["supported", "weak"]),
    note: z.string().max(400).catch(""),
  })).max(30),
});

const assessmentsOutputSchema = z.object({
  assessments: z.array(z.object({
    refId: z.string().trim().min(1).max(40),
    score: z.number().min(0).max(100),
    issues: z.string().max(500).catch(""),
    suggestion: z.string().max(800).catch(""),
  })).max(30),
});

const storiesOutputSchema = z.object({
  stories: z.array(z.object({
    refId: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(200),
    narrative: z.string().max(800).catch(""),
    acceptance: z.array(z.string().min(1).max(800)).max(8).catch([]),
    investScore: z.number().min(0).max(100).catch(0),
    investNote: z.string().max(400).catch(""),
  })).max(40),
});

const conflictsOutputSchema = z.object({
  conflicts: z.array(z.object({
    reqARef: z.string().trim().min(1).max(40),
    reqBRef: z.string().trim().min(1).max(40),
    kind: z.enum(["contradiction", "duplication", "overlap"]).catch("overlap"),
    taxonomy: z.enum(["value", "terminology", "scale", "constraint", "precedence", "knowledge"]).catch("value"),
    description: z.string().trim().min(1).max(800),
    severity: z.enum(["high", "medium", "low"]).catch("medium"),
    suggestion: z.string().max(800).catch(""),
    implications: z.array(z.object({
      option: z.string().min(1).max(200),
      impact: z.string().max(300).catch(""),
    })).max(4).catch([]),
  })).max(20),
});

const windTunnelOutputSchema = z.object({
  answers: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    answer: z.string().trim().min(1).max(1500),
  })).max(30),
});

const driftOutputSchema = z.object({
  impacted: z.array(z.object({
    refId: z.string().trim().min(1).max(40),
    note: z.string().max(500),
  })).max(100),
  summary: z.string().trim().min(1).max(1200),
});

const complianceOutputSchema = z.object({
  overall: z.enum(["pass", "partial", "fail"]),
  gaps: z.array(z.object({
    aspect: z.string().trim().min(1).max(200),
    note: z.string().max(600),
    suggestion: z.string().max(800),
  })).max(50),
  covered: z.array(z.object({
    refId: z.string().trim().min(1).max(40),
    aspect: z.string().trim().min(1).max(200),
  })).max(100),
});

const healthOutputSchema = z.object({
  summary: z.string().trim().min(1).max(1200),
  strengths: z.array(z.string().max(400)).max(20),
  risks: z.array(z.object({
    title: z.string().trim().min(1).max(200),
    note: z.string().max(600),
  })).max(20),
  recommendations: z.array(z.string().max(600)).max(20),
  ambiguityDebt: z.string().max(600),
  uncertaintyLedger: z.string().max(600),
  conflictDigest: z.string().max(600),
});

const memoryOutputSchema = z.object({
  glossary: z.array(z.object({
    term: z.string().trim().min(1).max(120),
    definition: z.string().max(400),
  })).max(10),
  lessons: z.array(z.object({
    term: z.string().trim().min(1).max(120),
    detail: z.string().max(400),
  })).max(10),
});

async function callLLM(userPrompt: string, usage: UsageAcc): Promise<string> {
  // Dev item 12 — the FIXED STRATEGY (transport retry, usage accounting)
  // lives here; the MODEL is whatever provider resolves from the environment.
  const provider = await getProvider();
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_BASE },
    { role: "user", content: userPrompt },
  ];
  const t0 = Date.now();
  let content: string;
  try {
    content = await provider.complete(messages);
  } catch (err) {
    // Retry only network/timeouts, rate limits and 5xx. A 401/403/400 or
    // schema/configuration error is permanent and should surface immediately.
    if (!retryableProviderFailure(err)) throw err;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    content = await provider.complete(messages);
  }
  const latencyMs = Date.now() - t0;
  usage.calls += 1;
  usage.latencyMs += latencyMs;
  usage.provider = provider.id;
  // chars/4 heuristic over prompt + completion (I13 estimate)
  const est = Math.ceil((userPrompt.length + content.length) / 4);
  usage.estTokens += est;
  return content;
}

// Call + parse with one retry on unparseable output (audit finding: a single
// malformed LLM response used to abort the whole stage run with a 500).
// Usage accumulates across attempts so the cost observatory stays honest.
async function callLLMJson<T>(userPrompt: string, usage: UsageAcc, schema: z.ZodType<T>, attempts = 2): Promise<T> {
  let lastErr: unknown = new Error("Agent returned unparseable output");
  for (let i = 0; i < attempts; i++) {
    const raw = await callLLM(userPrompt, usage);
    try {
      const parsed = parseJson<unknown>(raw);
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function parseJson<T>(raw: string): T {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through */
  }
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastBrace > 0) {
    try {
      return JSON.parse(text.slice(0, lastBrace + 1)) as T;
    } catch {
      /* fall through to structural repair */
    }
  }
  // Production hardening: long LLM outputs can be truncated mid-element.
  // Rebuild a valid prefix: cut at the last structural boundary outside
  // strings, strip dangling commas, then close all open brackets/strings.
  const repaired = repairTruncatedJson(text);
  if (repaired !== null) {
    try {
      return JSON.parse(repaired) as T;
    } catch {
      /* fall through */
    }
  }
  throw new Error("Agent returned unparseable output");
}

function repairTruncatedJson(text: string): string | null {
  // find last structural boundary outside strings
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "," || ch === "}" || ch === "]") lastSafe = i;
  }
  if (lastSafe < 0) return null;
  let cut = text.slice(0, lastSafe + 1);
  // re-scan the cut for unclosed structures
  const stack: string[] = [];
  let s = false;
  let e = false;
  for (const ch of cut) {
    if (s) {
      if (e) e = false;
      else if (ch === "\\") e = true;
      else if (ch === '"') s = false;
      continue;
    }
    if (ch === '"') {
      s = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (s) cut += '"';
  cut = cut.replace(/,\s*$/, "");
  while (stack.length) cut += stack.pop();
  return cut;
}

// Persist usage for the observatory (I13) — best-effort, never throws
async function recordUsage(runId: string | undefined, u: UsageAcc) {
  if (!runId || u.calls === 0) return;
  try {
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        latencyMs: u.latencyMs,
        estTokens: u.estTokens,
        estCostUsd: +(u.estTokens * 0.0000006).toFixed(6), // blended $0.60 / 1M tokens (estimate)
        promptVersion: PROMPT_VERSION,
        log: u.provider ? `provider:${u.provider}` : undefined,
      },
    });
  } catch {
    /* ignore */
  }
}

// ---------- context builders (G4 state re-injection) ----------

function evidenceBlock(evidences: { code: string; title: string; sourceType: string; language: string; content: string; consent?: boolean; origin?: string }[]): string {
  const eligible = filterEvidenceForAI(evidences);
  if (!eligible.length) {
    return evidences.length
      ? "(evidence sources are stored, but none has explicit permission for AI processing; no source content is sent to the model)"
      : "(no evidence sources provided yet)";
  }
  // Hard cap: each eligible source receives an equal share of a 16,000
  // character aggregate budget, up to 4,000 chars. The per-source floor is
  // intentionally zero for large source counts; the overall cap must win.
  const per = evidenceContentBudget(eligible.length, 16000, 4000);
  return eligible
    .map((e) => {
      const body =
        e.content.length > per
          ? `${e.content.slice(0, per)}\n[…truncated for this stage — ${e.content.length - per} more characters exist in this source]`
          : e.content;
      return `[${e.code}] (${e.sourceType}, language: ${e.language}) "${e.title}"\n${body}`;
    })
    .join("\n\n");
}

function briefBlock(brief: string): string {
  return brief?.trim() ? brief : "(empty brief)";
}

async function memoryBlock(projectId: string): Promise<string> {
  const lessons = await db.memoryEntry.findMany({
    where: { projectId, kind: "lesson" },
    orderBy: { createdAt: "desc" },
    take: 6,
  });
  if (!lessons.length) return "";
  return `\nPROJECT-SCOPED LESSONS (from this project's own evidence and decisions):\n${lessons
    .map((l) => `- ${l.term}: ${l.detail}`)
    .join("\n")}\n`;
}

function uncertaintyBlock(questions: { text: string; fallbackAssumption: string | null; resolution: string }[]): string {
  const decided = questions.filter((q) => q.resolution === "proceed_with_uncertainty" && q.fallbackAssumption);
  if (!decided.length) return "";
  return `\nUNCERTAINTY LEDGER (the human chose to proceed WITHOUT asking these — treat the stated assumption as an explicit, auditable assumption):\n${decided
    .map((q) => `- Assume: ${q.fallbackAssumption} (instead of asking: "${q.text.slice(0, 120)}")`)
    .join("\n")}\n`;
}

// ---------- stage 1: ELICITATION (I1 + I4) ----------

export interface AgentQuestion {
  text: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  askCost: number;
  fallbackAssumption: string;
}

export async function runElicitation(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true },
  });
  const existingQuestions = await db.question.findMany({
    where: { projectId },
    select: { answered: true, answer: true, answerSource: true, resolution: true },
  });
  if (hasHumanQuestionDecision(existingQuestions)) {
    throw new Error("Refusing to regenerate elicitation: human answers or uncertainty decisions already exist.");
  }
  const usage = newUsage();

  const memory = await memoryBlock(projectId);

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}
${memory}
EVIDENCE SOURCES:
${evidenceBlock(project.evidences)}

TASK: Identify the most valuable clarifying questions a requirements analyst must ask the stakeholders before extracting requirements. Focus on scope, users/roles, constraints, quality attributes and success criteria.

LANGUAGE POLICY (Arabic-native-first, N7): inspect the evidence languages first. When the evidence contains substantial Egyptian Arabic (or code-switched) content, the DEFAULT output is native Egyptian-Arabic questions written exactly as stakeholders speak (e.g. "طيب إزاي النظام هيتعامل مع...؟") — write ALL questions targeting Arabic-speaking stakeholders in Egyptian Arabic, not merely two; only questions about purely technical constraints written in English sources may stay in English. Mirror code-switched evidence with code-switched questions. This is the platform's native-interview contract: the stakeholder should never have to translate their own context.

This platform implements an UNCERTAINTY-GATED ask-versus-proceed policy: for every question also estimate how costly it is to interrupt the stakeholder, and state what the team would have to ASSUME if the question were skipped. Ask-cost 1 = trivial to ask, 5 = very costly interruption. The fallback assumption must be explicit and testable. Write the fallback assumption in the SAME language as the question.

Return JSON: {"questions": [{"text": "...", "rationale": "why this matters", "priority": "high|medium|low", "askCost": 2, "fallbackAssumption": "if skipped, assume that ..."}]}`;

  const out = await callLLMJson<{ questions: AgentQuestion[] }>(prompt, usage, questionsOutputSchema);
  const qs = (out.questions ?? []).slice(0, 7);
  if (!qs.length) throw new Error("Elicitation returned no usable questions; the previous question set was preserved.");

  await db.$transaction(async (tx) => {
    await tx.question.deleteMany({ where: { projectId } });
    for (const [i, q] of qs.entries()) {
      await tx.question.create({
        data: {
          projectId,
          order: i,
          text: String(q.text ?? "").slice(0, 600),
          rationale: String(q.rationale ?? "").slice(0, 600),
          priority: ["high", "medium", "low"].includes(q.priority) ? q.priority : "medium",
          askCost: Math.min(5, Math.max(1, Math.round(Number(q.askCost) || 3))),
          fallbackAssumption: String(q.fallbackAssumption ?? "").slice(0, 400) || null,
        },
      });
    }
  });
  await saveArtifact(projectId, "ELICITATION", out);
  await recordUsage(runId, usage);
}

// ---------- stage 2: PROBLEM_SELECTION ----------

export interface AgentCandidate {
  title: string;
  description: string;
  evidenceCodes: string[];
  suggestedImpact: number;
  suggestedEffort: number;
}

export async function runProblemSelection(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true },
  });
  const existingCandidates = await db.problemCandidate.findMany({
    where: { projectId },
    select: { selected: true, humanEdited: true },
  });
  if (hasHumanCandidateEdits(existingCandidates)) {
    throw new Error("Refusing to regenerate problem candidates: a candidate has been selected or manually scored.");
  }
  const usage = newUsage();

  const answers = project.questions
    .filter(isHumanStakeholderAnswer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}

EVIDENCE SOURCES:
${evidenceBlock(project.evidences)}

STAKEHOLDER ANSWERS:
${answers || "(no answers yet)"}
${uncertaintyBlock(project.questions)}
TASK: Propose 3-4 candidate problem statements worth solving in this project. For each: a short title, a 2-3 sentence description, the evidence codes that ground it, and suggested impact (1-5, value to users/business) and effort (1-5, 5 = hardest). Prefer problems strongly supported by the evidence. Treat ledger assumptions as provisional, not as facts.

Return JSON: {"candidates": [{"title": "...", "description": "...", "evidenceCodes": ["E-ABC12345"], "suggestedImpact": 4, "suggestedEffort": 3}]}`;

  const out = await callLLMJson<{ candidates: AgentCandidate[] }>(prompt, usage, candidatesOutputSchema);
  const cs = (out.candidates ?? []).slice(0, 4);
  if (!cs.length) throw new Error("Problem selection returned no usable candidates; the previous candidate set was preserved.");

  const clamp = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 3)));
  await db.$transaction(async (tx) => {
    await tx.problemCandidate.deleteMany({ where: { projectId } });
    for (const candidate of cs) {
      await tx.problemCandidate.create({
        data: {
          projectId,
          humanEdited: false,
          title: String(candidate.title ?? "Untitled").slice(0, 200),
          description: String(candidate.description ?? "").slice(0, 1000),
          impact: clamp(candidate.suggestedImpact),
          effort: clamp(candidate.suggestedEffort),
          evidenceIds: (candidate.evidenceCodes ?? []).join(","),
        },
      });
    }
  });
  await saveArtifact(projectId, "PROBLEM_SELECTION", out);
  await recordUsage(runId, usage);
}

// ---------- stage 3: EXTRACTION (I2 confidence + I3 critic) ----------

export interface AgentRequirement {
  text: string;
  type: "functional" | "nonfunctional" | "constraint";
  priority: "Must" | "Should" | "Could" | "Won't";
  evidenceCodes: string[];
  confidence: number;
  language: string;
}

interface Verdict {
  refId: string;
  verdict: "supported" | "weak";
  note: string;
}

export async function runExtraction(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true, candidates: true },
  });
  const [existingRequirements, storiesCount, conflictsCount, edgesCount, scenariosCount, syncMapsCount] = await Promise.all([
    db.requirement.findMany({ where: { projectId }, select: { status: true } }),
    db.userStory.count({ where: { projectId } }),
    db.conflict.count({ where: { projectId } }),
    db.reqEdge.count({ where: { projectId } }),
    db.execScenario.count({ where: { projectId } }),
    db.syncMap.count({ where: { projectId } }),
  ]);
  if (existingRequirements.some((r) => r.status !== "draft") ||
      storiesCount + conflictsCount + edgesCount + scenariosCount + syncMapsCount > 0) {
    throw new Error("Refusing to replace requirements: reviewed requirements or dependent stories, conflicts, graph edges, scenarios or sync records already exist.");
  }
  const usage = newUsage();

  const answers = project.questions
    .filter(isHumanStakeholderAnswer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");

  const selected = project.candidates.find((c) => c.selected);
  const evidences = filterEvidenceForAI(project.evidences);
  const codeToId = new Map(evidences.map((e) => [e.code, e.id]));

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}

SELECTED PROBLEM STATEMENT:
${selected ? `${selected.title} — ${selected.description}` : "(none selected — cover the whole brief)"}

EVIDENCE SOURCES:
${evidenceBlock(evidences)}

STAKEHOLDER ANSWERS:
${answers || "(no answers yet)"}
${uncertaintyBlock(project.questions)}
TASK: Extract 8-12 atomic requirements for the selected problem. Each requirement must be a single testable statement ("The system shall …"). Cite the evidence codes that ground it. Set priority by MoSCoW. Keep the original language of the source when a requirement is grounded in Arabic or code-switched evidence (set language accordingly: "en", "ar-EG" or "codeswitch"); otherwise use English. Also report your confidence (0-100) that each requirement is correct, complete and correctly grounded.

Return JSON: {"requirements": [{"text": "...", "type": "functional|nonfunctional|constraint", "priority": "Must|Should|Could|Won't", "evidenceCodes": ["E1"], "confidence": 82, "language": "en"}]}`;

  const out = await callLLMJson<{ requirements: AgentRequirement[] }>(prompt, usage, requirementsOutputSchema);
  const rs = (out.requirements ?? []).slice(0, 14);

  // Replace the generated requirements and their provenance in one transaction.
  // If any record or TraceLink fails to persist, the old baseline stays intact.
  if (!rs.length) throw new Error("Extraction returned no requirements; the previous requirement set was preserved.");
  const refIndex: { refId: string; id: string; text: string; evidenceCodes: string[] }[] = [];
  await db.$transaction(async (tx) => {
    await tx.requirement.deleteMany({ where: { projectId } });
    let i = 0;
    for (const r of rs) {
      i += 1;
      const refId = `REQ-${String(i).padStart(2, "0")}`;
      const type = ["functional", "nonfunctional", "constraint"].includes(r.type)
        ? r.type
        : "functional";
      const priority = ["Must", "Should", "Could", "Won't"].includes(r.priority)
        ? r.priority
        : "Should";
      const codes = (r.evidenceCodes ?? []).filter((code) => codeToId.has(code));
      const created = await tx.requirement.create({
        data: {
          projectId,
          refId,
          text: String(r.text ?? "").slice(0, 800),
          type,
          priority,
          language: ["en", "ar-EG", "codeswitch"].includes(r.language) ? r.language : "en",
          confidence: Number.isFinite(Number(r.confidence))
            ? Math.min(100, Math.max(0, Math.round(Number(r.confidence))))
            : 60,
          ambiguity: -1,
          order: i,
        },
      });
      refIndex.push({ refId, id: created.id, text: created.text, evidenceCodes: codes });
      if (codes.length === 0) {
        await tx.requirement.update({
          where: { id: created.id },
          data: {
            verifyStatus: "weak",
            verifyNote: "No valid evidence citation provided by the extractor — human must ground or delete this requirement.",
          },
        });
      }
      for (const code of codes) {
        const evidenceId = codeToId.get(code);
        if (!evidenceId) continue;
        await tx.traceLink.create({
          data: {
            projectId,
            requirementId: created.id,
            evidenceId,
            evidenceCode: code,
            note: "cited by extraction agent",
          },
        });
      }
    }
  });

  // ── I3 critic-verifier pass: second model call checks each
  //    requirement against the evidence spans (Propose → Verify).
  try {
    const verifiable = refIndex.filter((r) => r.evidenceCodes.length > 0);
    if (verifiable.length) {
      const verifierCases = verifiable.map((r) => {
        const cited = evidences.filter((e) => r.evidenceCodes.includes(e.code));
        return `CANDIDATE ${r.refId}: ${r.text}\nITS CITED EVIDENCE ONLY:\n${evidenceBlock(cited)}`;
      });
      const verifyPrompt = `You are the VERIFIER in a propose-verify requirements pipeline.
Each candidate is paired ONLY with the evidence sources it explicitly cited. Do not use another candidate's evidence or unrelated project context.
For each candidate, mark "supported" only when its own cited evidence directly states or clearly entails the requirement. Otherwise mark "weak".

${verifierCases.join("\n\n---\n\n")}

Return JSON: {"verdicts": [{"refId": "REQ-01", "verdict": "supported|weak", "note": "one-line justification"}]}`;

      const vOut = await callLLMJson<{ verdicts: Verdict[] }>(verifyPrompt, usage, verdictsOutputSchema);
      for (const v of vOut.verdicts ?? []) {
        const target = refIndex.find((r) => r.refId === v.refId);
        if (!target || !target.evidenceCodes.length) continue;
        await db.requirement.update({
          where: { id: target.id },
          data: {
            verifyStatus: v.verdict === "supported" ? "supported" : "weak",
            verificationSource: "agent",
            verifyNote: String(v.note ?? "").slice(0, 400),
          },
        });
      }
    }
  } catch {
    // verifier is best-effort; requirements stay "unverified" on failure
  }

  await saveArtifact(projectId, "EXTRACTION", out);
  await recordUsage(runId, usage);
}

// ---------- stage 4: AMBIGUITY (Arabic lexicon, G14) ----------

export interface AgentAssessment {
  refId: string;
  score: number;
  issues: string;
  suggestion: string;
}

export async function runAmbiguity(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });
  const usage = newUsage();

  const list = project.reqs
    .map((r) => `${r.refId}: ${r.text}`)
    .join("\n");

  const prompt = `REQUIREMENTS:
${list}

TASK: Score each requirement for ambiguity from 0 (crisp, testable) to 100 (vague, untestable). Flag the specific weak words (e.g. "fast", "user-friendly", "etc", "appropriate", passive voice, missing quantifiers). For Arabic and code-switched requirements, also use this Arabic ambiguity lexicon: كثير، سريع، مناسب، جيد، إلخ، تقريبا، غالبا، بسهولة، بشكل مريح، وغيرها — when the requirement text is Arabic or code-switched, quote the exact weak word in Arabic and write both the issues note and the suggestion in the requirement's own language. For any requirement scoring 30 or above, propose a sharper measurable rewrite. Respond for every requirement, in the requirement's own language.

Return JSON: {"assessments": [{"refId": "REQ-01", "score": 42, "issues": "vague term 'fast'", "suggestion": "rewritten requirement"}]}`;

  const out = await callLLMJson<{ assessments: AgentAssessment[] }>(prompt, usage, assessmentsOutputSchema);
  const map = new Map((out.assessments ?? []).map((a) => [a.refId, a]));

  for (const r of project.reqs) {
    const a = map.get(r.refId);
    if (!a) continue;
    const score = Math.min(100, Math.max(0, Math.round(Number(a.score) || 0)));
    await db.requirement.update({
      where: { id: r.id },
      data: {
        ambiguity: score,
        ambiguityNote: String(a.issues ?? "").slice(0, 500),
        suggestion: score >= 30 ? String(a.suggestion ?? "").slice(0, 800) : null,
      },
    });
  }
  await saveArtifact(projectId, "AMBIGUITY", out);
  await recordUsage(runId, usage);
}

// ---------- stage 5: STORIES (I9 Gherkin-ready) ----------

export interface AgentStory {
  refId: string;
  title: string;
  narrative: string;
  acceptance: string[];
  investScore: number;
  investNote: string;
}

export async function runStories(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });
  const usage = newUsage();

  const list = project.reqs
    .map((r) => `${r.refId} (${r.type}, ${r.priority}): ${r.text}`)
    .join("\n");

  const prompt = `APPROVED REQUIREMENTS:
${list}

TASK: Write one user story per requirement (skip "Won't" priorities). Narrative format: "As a <role>, I want <capability>, so that <benefit>." Give 2-4 acceptance criteria per story written in Gherkin style — each starting with "Given … when … then …" — concrete and testable, so they can be exported as executable .feature skeletons. Use the requirement's own language. Score INVEST quality 0-100 with a one-line note.

Return JSON: {"stories": [{"refId": "REQ-01", "title": "short title", "narrative": "As a...", "acceptance": ["Given ... when ... then ..."], "investScore": 78, "investNote": "..."}]}`;

  const [existingStories, existingSyncMaps] = await Promise.all([
    db.userStory.findMany({ where: { projectId }, select: { status: true } }),
    db.syncMap.count({ where: { projectId } }),
  ]);
  if (existingStories.some((story) => story.status !== "draft") || existingSyncMaps > 0) {
    throw new Error("Refusing to regenerate stories: reviewed or externally synchronized stories already exist.");
  }

  const out = await callLLMJson<{ stories: AgentStory[] }>(prompt, usage, storiesOutputSchema);
  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));

  const validStories = (out.stories ?? []).filter((story) => {
    const requirement = byRef.get(story.refId);
    return Boolean(requirement && requirement.priority !== "Won't" && String(story.title ?? "").trim());
  });
  if (!validStories.length && project.reqs.some((requirement) => requirement.priority !== "Won't")) {
    throw new Error("Story generation returned no valid stories; the previous story set was preserved.");
  }
  await db.$transaction(async (tx) => {
    await tx.userStory.deleteMany({ where: { projectId } });
    let i = 0;
    for (const story of validStories) {
      const requirement = byRef.get(story.refId)!;
      i += 1;
      await tx.userStory.create({
        data: {
          projectId,
          requirementId: requirement.id,
          refId: `US-${String(i).padStart(2, "0")}`,
          title: String(story.title ?? requirement.refId).slice(0, 200),
          narrative: String(story.narrative ?? "").slice(0, 800),
          acceptance: (story.acceptance ?? []).map(String).join("\n").slice(0, 2000),
          investScore: Math.min(100, Math.max(0, Math.round(Number(story.investScore) || 0))),
          investNote: String(story.investNote ?? "").slice(0, 400),
        },
      });
    }
  });
  await saveArtifact(projectId, "STORIES", out);
  await recordUsage(runId, usage);
}

// ---------- stage 6: CONFLICTS ----------

export interface AgentConflict {
  reqARef: string;
  reqBRef: string;
  kind: "contradiction" | "duplication" | "overlap";
  taxonomy: "value" | "terminology" | "scale" | "constraint" | "precedence" | "knowledge";
  description: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
  implications: { option: string; impact: string }[];
}

export async function runConflicts(projectId: string, runId?: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });
  const usage = newUsage();

  const list = project.reqs.map((r) => `${r.refId}: ${r.text}`).join("\n");

  const prompt = `REQUIREMENTS:
${list}

TASK: Cross-check all requirement pairs and report genuine findings only (0 to 5):
(a) contradictions — cannot both hold,
(b) duplications — same need stated twice,
(c) overlaps — partially conflicting scopes.

CLASSIFY each finding along the conflict taxonomy (dev item 10):
- "value"       — stakeholders want opposing outcomes
- "terminology" — same words mean different things (or vice versa)
- "scale"       — same intent at incompatible quantities/latencies/budgets
- "constraint"  — a nonfunctional or regulatory constraint blocks another requirement
- "precedence"  — ordering/dependency makes one impossible after another
- "knowledge"   — the conflict exists only because evidence is missing

For each finding, lay out the IMPLICATIONS of each resolution direction — what becomes true, what becomes impossible, what costs or scope shifts follow — WITHOUT recommending one. The human arbitrates; the system never decides (implications-only negotiation contract).

Return JSON: {"conflicts": [{"reqARef": "REQ-01", "reqBRef": "REQ-04", "kind": "contradiction", "taxonomy": "scale", "description": "...", "severity": "high", "suggestion": "...", "implications": [{"option": "Keep REQ-01 as written", "impact": "..."}, {"option": "Keep REQ-04 as written", "impact": "..."}, {"option": "Merge/re-scope", "impact": "..."}]}]}`;

  const resolvedConflict = await db.conflict.findFirst({ where: { projectId, status: "resolved" }, select: { id: true } });
  if (resolvedConflict) {
    throw new Error("Refusing to regenerate conflicts: at least one conflict has a human resolution.");
  }

  const out = await callLLMJson<{ conflicts: AgentConflict[] }>(prompt, usage, conflictsOutputSchema);
  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));

  const TAXONOMIES = ["value", "terminology", "scale", "constraint", "precedence", "knowledge"];
  await db.$transaction(async (tx) => {
    await tx.conflict.deleteMany({ where: { projectId } });
    for (const conflict of (out.conflicts ?? []).slice(0, 6)) {
      const a = byRef.get(conflict.reqARef);
      const b = byRef.get(conflict.reqBRef);
      if (!a || !b || a.id === b.id) continue;
      const implications = Array.isArray(conflict.implications)
        ? conflict.implications
            .filter((item) => item && item.option)
            .slice(0, 4)
            .map((item) => ({ option: String(item.option).slice(0, 200), impact: String(item.impact ?? "").slice(0, 300) }))
        : [];
      await tx.conflict.create({
        data: {
          projectId,
          reqAId: a.id,
          reqBId: b.id,
          kind: ["contradiction", "duplication", "overlap"].includes(conflict.kind) ? conflict.kind : "overlap",
          taxonomy: TAXONOMIES.includes(conflict.taxonomy) ? conflict.taxonomy : "value",
          description: String(conflict.description ?? "").slice(0, 800),
          severity: ["high", "medium", "low"].includes(conflict.severity) ? conflict.severity : "medium",
          suggestion: String(conflict.suggestion ?? "").slice(0, 800),
          implications: implications.length ? JSON.stringify(implications) : null,
        },
      });
    }
  });
  await saveArtifact(projectId, "CONFLICTS", out);
  await recordUsage(runId, usage);
}

// ---------- I7 synthetic stakeholder wind tunnel ----------

export async function runWindTunnel(
  projectId: string,
  persona: string,
  secret: string
): Promise<{ answered: number }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { questions: true },
  });
  const usage = newUsage();

  const pending = project.questions.filter((q) => !q.answered);
  if (!pending.length) return { answered: 0 };

  const prompt = `You are simulating a SYNTHETIC STAKEHOLDER in a requirements "wind tunnel". The purpose is stress-testing the clarifying questions before a real interview.

PERSONA: ${persona}

HELD-OUT SECRET (the persona knows this but will only reveal it if a question DIRECTLY probes the topic; otherwise give an evasive, vague or partially relevant answer): ${secret || "(none)"}

QUESTIONS:
${pending.map((q) => `[${q.id}] ${q.text}`).join("\n")}

TASK: Answer each question in character. If (and only if) a question directly probes the secret's topic, you MUST reveal the specific facts contained in the secret naturally within that answer — never invent alternative facts (e.g. different figures or dates) to substitute for the secret. Otherwise answer plausibly but incompletely, evading details you were not given. Answers should be in the persona's voice; mirror the language style of the question (English, Egyptian Arabic or code-switched).

Return JSON: {"answers": [{"id": "question id", "answer": "..."}]}`;

  const out = await callLLMJson<{ answers: { id: string; answer: string }[] }>(prompt, usage, windTunnelOutputSchema);
  let n = 0;
  for (const a of out.answers ?? []) {
    const q = pending.find((p) => p.id === a.id);
    if (!q || !a.answer?.trim()) continue;
    await db.question.update({
      where: { id: q.id },
      data: {
        answer: `[synthetic · wind tunnel] ${String(a.answer).slice(0, 1500)}`,
        answered: true,
        resolution: "answered",
        answerSource: "synthetic",
      },
    });
    n += 1;
  }
  await logDecision(
    projectId,
    "ELICITATION",
    "agent",
    "synthetic_answers",
    `Wind tunnel (${persona.slice(0, 80)}) filled ${n} answer(s) with persona-conditioned synthetic responses.`
  );
  await saveArtifact(projectId, "WIND_TUNNEL", { persona, secret, answers: out.answers ?? [] });
  return { answered: n };
}

// ---------- I8 drift radar ----------

export async function runDrift(projectId: string, signal: string): Promise<{ impacted: number; summary: string }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });
  const usage = newUsage();

  const prompt = `REQUIREMENTS BASELINE:
${project.reqs.map((r) => `${r.refId}: ${r.text}`).join("\n")}

CHANGE SIGNAL (something that changed in the project's world after the baseline was frozen):
${signal}

TASK: Determine which requirements are impacted by this change signal (contradicted, invalidated, now incomplete, or needing revision). Be conservative — only flag genuinely impacted requirements (0 to all). Give a one-paragraph summary.

Return JSON: {"impacted": [{"refId": "REQ-03", "note": "why it is impacted"}], "summary": "..."}`;

  const out = await callLLMJson<{ impacted: { refId: string; note: string }[]; summary: string }>(prompt, usage, driftOutputSchema);

  const impactedById = new Map<string, { refId: string; note: string }>();
  for (const impact of out.impacted ?? []) {
    const requirement = project.reqs.find((item) => item.refId === impact.refId);
    if (!requirement) continue;
    impactedById.set(requirement.id, {
      refId: requirement.refId,
      note: String(impact.note ?? "").slice(0, 500),
    });
  }
  // A new scan is additive: it must never silently clear a previous drift
  // signal. Only an explicit human triage decision may clear/confirm a flag.
  await db.$transaction(async (tx) => {
    for (const [requirementId] of impactedById) {
      await tx.requirement.update({
        where: { id: requirementId },
        data: { driftStatus: "suspected" },
      });
    }
    await tx.artifact.create({
      data: {
        projectId,
        stage: "DRIFT",
        kind: "json",
        content: JSON.stringify({
          ...out,
          signal: signal.slice(0, 2000),
          detectedAt: new Date().toISOString(),
          impacted: [...impactedById.values()],
        }).slice(0, 24000),
      },
    });
  });
  const impacted = [...impactedById.values()];
  await logDecision(
    projectId,
    "LIFECYCLE",
    "agent",
    "drift_check",
    `Change signal: ${signal.slice(0, 220)}; ${impacted.length} newly flagged requirement(s). ${String(out.summary ?? "").slice(0, 500)}`
  );
  return { impacted: impacted.length, summary: String(out.summary ?? ""), requirements: impacted };
}

// ---------- I11 compliance / NFR constraint packs ----------

export const PACKS: Record<string, { label: string; description: string }> = {
  gdpr: {
    label: "Privacy & data protection (Egypt PDPL-inspired)",
    description:
      "lawful basis & consent, personal data handling, data minimisation, retention & deletion, user rights (access/export/erasure), breach notification, data residency in Egypt where applicable",
  },
  accessibility: {
    label: "Accessibility (WCAG 2.2)",
    description:
      "keyboard operability, screen-reader support, colour contrast, text alternatives, focus visibility, RTL/multilingual text handling, low-bandwidth and low-end device support",
  },
  performance: {
    label: "Performance & resilience",
    description:
      "response-time targets, throughput, offline/weak connectivity behaviour, graceful degradation, error handling, monitoring and alerting",
  },
};

export async function runCompliance(projectId: string, pack: string): Promise<{
  overall: string;
  gaps: { aspect: string; note: string; suggestion: string }[];
  covered: { refId: string; aspect: string }[];
}> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: true },
  });
  const usage = newUsage();
  const p = PACKS[pack] ?? PACKS.gdpr;

  const prompt = `REQUIREMENT GRAPH:
${project.reqs.map((r) => `${r.refId} (${r.type}, ${r.priority}): ${r.text}`).join("\n")}

CONSTRAINT PACK: ${p.label}
ASPECTS THE PACK EXPECTS TO SEE COVERED: ${p.description}

TASK: Check the requirement graph against the pack. List which requirements cover which aspects, and list the gaps — aspects with NO adequate coverage. For each gap propose one concrete requirement to add. overall: "pass" if no material gaps, "partial" if some, "fail" if most aspects are missing.

Return JSON: {"overall": "partial", "covered": [{"refId": "REQ-02", "aspect": "consent"}], "gaps": [{"aspect": "data retention", "note": "no requirement covers deletion/retention", "suggestion": "The system shall allow a user to delete their account and all associated data within 30 days."}]}`;

  const out = await callLLMJson<{
    overall: string;
    gaps: { aspect: string; note: string; suggestion: string }[];
    covered: { refId: string; aspect: string }[];
  }>(prompt, usage, complianceOutputSchema);
  await logDecision(projectId, "LIFECYCLE", "agent", "compliance_check", `${p.label}: ${out.overall}`);
  await saveArtifact(projectId, "COMPLIANCE", { pack, ...out });
  return out;
}

// ---------- I14 requirements health report ----------

export interface HealthReport {
  summary: string;
  strengths: string[];
  risks: { title: string; note: string }[];
  recommendations: string[];
  ambiguityDebt: string;
  uncertaintyLedger: string;
  conflictDigest: string;
}

export async function runHealth(projectId: string): Promise<HealthReport> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: true, conflicts: { include: { reqA: true, reqB: true } }, questions: true, candidates: true, stories: true },
  });
  const usage = newUsage();

  const assessed = project.reqs.filter((r) => r.ambiguity >= 0);
  const avgAmb = assessed.length ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length) : -1;
  const flagged = assessed.filter((r) => r.ambiguity >= 30);
  const uncertain = project.questions.filter((q) => q.resolution === "proceed_with_uncertainty");
  const unresolvedConflicts = project.conflicts.filter((c) => c.status === "open");
  const selected = project.candidates.find((c) => c.selected);

  const stats = `PROJECT: ${project.name}
SELECTED PROBLEM: ${selected ? selected.title : "(none)"}
REQUIREMENTS: ${project.reqs.length} total; avg ambiguity ${avgAmb < 0 ? "n/a" : avgAmb}; ${flagged.length} flagged >= 30; weak-verification: ${project.reqs.filter((r) => r.verifyStatus === "weak").length}; low-confidence (<50): ${project.reqs.filter((r) => r.confidence >= 0 && r.confidence < 50).length}
UNCERTAINTY LEDGER: ${uncertain.length} assumption(s) carried without asking:
${uncertain.map((q) => `- ${q.fallbackAssumption ?? q.text}`).join("\n") || "(none)"}
CONFLICTS: ${project.conflicts.length} detected, ${unresolvedConflicts.length} still open
STORIES: ${project.stories.length}`;

  const prompt = `${stats}

TASK: Produce a requirements health report for handoff. Write it for a delivery team lead. Be specific and honest; do not pad. ambiguityDebt / uncertaintyLedger / conflictDigest must each be 1-2 sentences quantifying that debt area.

Return JSON: {"summary": "2-3 sentence overall health assessment", "strengths": ["..."], "risks": [{"title": "...", "note": "..."}], "recommendations": ["..."], "ambiguityDebt": "...", "uncertaintyLedger": "...", "conflictDigest": "..."}`;

  const out = await callLLMJson<HealthReport>(prompt, usage, healthOutputSchema);
  await logDecision(projectId, "LIFECYCLE", "agent", "health_report", out.summary ?? "");
  await saveArtifact(projectId, "HEALTH", out);
  return out;
}

// ---------- I4 project-scoped memory harvest ----------

export async function harvestMemory(projectId: string): Promise<void> {
  try {
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { reqs: true, questions: true, candidates: true, evidences: true },
    });
    const usage = newUsage();

    const prompt = `A requirements project just completed. Harvest reusable knowledge for the next stages of THIS project only. Do not generalize stakeholder data for other projects.

PROJECT: ${project.name}
BRIEF: ${briefBlock(project.brief)}
DOMAIN EVIDENCE: ${evidenceBlock(project.evidences).slice(0, 2000)}
SELECTED PROBLEM: ${project.candidates.find((c) => c.selected)?.title ?? "(none)"}
Q&A OUTCOMES:
${project.questions.filter(isHumanStakeholderAnswer).map((q) => `- Q: ${q.text.slice(0, 100)} → A: ${(q.answer ?? "").slice(0, 100)}`).join("\n") || "(none)"}

TASK: Extract (a) 3-5 domain GLOSSARY terms with crisp definitions, and (b) 2-4 project-specific LESSONS — what this same project's team should do in its next stages (decision constraints, discovered domain terms, validated tactics). Do not include personal data or material that should not leave this project's boundary.

Return JSON: {"glossary": [{"term": "...", "definition": "..."}], "lessons": [{"term": "short lesson title", "detail": "..."}]}`;

    const out = await callLLMJson<{
      glossary: { term: string; definition: string }[];
      lessons: { term: string; detail: string }[];
    }>(prompt, usage, memoryOutputSchema);

    for (const g of (out.glossary ?? []).slice(0, 5)) {
      if (!g.term) continue;
      await db.memoryEntry.create({
        data: { projectId, kind: "glossary", term: String(g.term).slice(0, 120), detail: String(g.definition ?? "").slice(0, 400) },
      });
    }
    for (const l of (out.lessons ?? []).slice(0, 4)) {
      if (!l.term) continue;
      await db.memoryEntry.create({
        data: { projectId, kind: "lesson", term: String(l.term).slice(0, 120), detail: String(l.detail ?? "").slice(0, 400) },
      });
    }
  } catch {
    // memory harvest is best-effort
  }
}

// ---------- dispatcher ----------

export async function runStageAgent(stage: Stage, projectId: string, runId?: string): Promise<void> {
  switch (stage) {
    case "ELICITATION":
      return runElicitation(projectId, runId);
    case "PROBLEM_SELECTION":
      return runProblemSelection(projectId, runId);
    case "EXTRACTION":
      return runExtraction(projectId, runId);
    case "AMBIGUITY":
      return runAmbiguity(projectId, runId);
    case "STORIES":
      return runStories(projectId, runId);
    case "CONFLICTS":
      return runConflicts(projectId, runId);
  }
}

async function saveArtifact(projectId: string, stage: string, data: unknown): Promise<void> {
  await db.artifact.create({
    data: {
      projectId,
      stage,
      kind: "json",
      content: JSON.stringify(data).slice(0, 20000),
    },
  });
}
