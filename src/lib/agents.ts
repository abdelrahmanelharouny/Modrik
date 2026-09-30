// ─────────────────────────────────────────────────────────────
// RequirementPilot — agent stage runners (server-side only)
// Each stage agent calls the LLM, parses structured JSON output
// and persists results. Human approval happens between stages.
// ─────────────────────────────────────────────────────────────
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import type { Stage } from "@/lib/rp";

// ---------- LLM plumbing ----------

const SYSTEM_BASE =
  "You are part of RequirementPilot, an evidence-based, human-in-the-loop " +
  "requirements engineering assistant. You are precise, conservative and " +
  "ground every statement in the provided evidence. Reply with VALID JSON ONLY — " +
  "no markdown fences, no commentary before or after the JSON.";

async function callLLM(userPrompt: string): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_BASE },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

function parseJson<T>(raw: string): T {
  let text = raw.trim();
  // strip possible markdown fences
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  if (start > 0) text = text.slice(start);
  // try progressively: full parse → last balanced brace
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through */
  }
  const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (lastBrace > 0) {
    return JSON.parse(text.slice(0, lastBrace + 1)) as T;
  }
  throw new Error("Agent returned unparseable output");
}

// ---------- context builders ----------

function evidenceBlock(evidences: { code: string; title: string; sourceType: string; language: string; content: string }[]): string {
  if (!evidences.length) return "(no evidence sources provided yet)";
  return evidences
    .map(
      (e) =>
        `[${e.code}] (${e.sourceType}, language: ${e.language}) "${e.title}"\n${e.content.slice(0, 1200)}`
    )
    .join("\n\n");
}

function briefBlock(brief: string): string {
  return brief?.trim() ? brief : "(empty brief)";
}

// ---------- stage 1: ELICITATION ----------

export interface AgentQuestion {
  text: string;
  rationale: string;
  priority: "high" | "medium" | "low";
}

export async function runElicitation(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true },
  });

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}

EVIDENCE SOURCES:
${evidenceBlock(project.evidences)}

TASK: Identify the 5 most important clarifying questions a requirements analyst must ask the stakeholders before extracting requirements. Focus on scope, users/roles, constraints, quality attributes and success criteria. Questions may be asked in the same language style as the evidence (English, Egyptian Arabic, or code-switched) if that matches the stakeholder.

Return JSON: {"questions": [{"text": "...", "rationale": "why this matters", "priority": "high|medium|low"}]}`;

  const out = parseJson<{ questions: AgentQuestion[] }>(await callLLM(prompt));
  const qs = (out.questions ?? []).slice(0, 7);

  await db.question.deleteMany({ where: { projectId } });
  await db.$transaction(
    qs.map((q, i) =>
      db.question.create({
        data: {
          projectId,
          order: i,
          text: String(q.text ?? "").slice(0, 600),
          rationale: String(q.rationale ?? "").slice(0, 600),
          priority: ["high", "medium", "low"].includes(q.priority) ? q.priority : "medium",
        },
      })
    )
  );
  await saveArtifact(projectId, "ELICITATION", out);
}

// ---------- stage 2: PROBLEM_SELECTION ----------

export interface AgentCandidate {
  title: string;
  description: string;
  evidenceCodes: string[];
  suggestedImpact: number;
  suggestedEffort: number;
}

export async function runProblemSelection(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true },
  });

  const answers = project.questions
    .filter((q) => q.answered && q.answer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}

EVIDENCE SOURCES:
${evidenceBlock(project.evidences)}

STAKEHOLDER ANSWERS:
${answers || "(no answers yet)"}

TASK: Propose 3-4 candidate problem statements worth solving in this project. For each: a short title, a 2-3 sentence description, the evidence codes that ground it, and suggested impact (1-5, value to users/business) and effort (1-5, 5 = hardest). Prefer problems strongly supported by the evidence.

Return JSON: {"candidates": [{"title": "...", "description": "...", "evidenceCodes": ["E1"], "suggestedImpact": 4, "suggestedEffort": 3}]}`;

  const out = parseJson<{ candidates: AgentCandidate[] }>(await callLLM(prompt));
  const cs = (out.candidates ?? []).slice(0, 4);

  await db.problemCandidate.deleteMany({ where: { projectId } });
  const clamp = (n: unknown) => Math.min(5, Math.max(1, Math.round(Number(n) || 3)));
  await db.$transaction(
    cs.map((c) =>
      db.problemCandidate.create({
        data: {
          projectId,
          title: String(c.title ?? "Untitled").slice(0, 200),
          description: String(c.description ?? "").slice(0, 1000),
          impact: clamp(c.suggestedImpact),
          effort: clamp(c.suggestedEffort),
          evidenceIds: (c.evidenceCodes ?? []).join(","),
        },
      })
    )
  );
  await saveArtifact(projectId, "PROBLEM_SELECTION", out);
}

// ---------- stage 3: EXTRACTION ----------

export interface AgentRequirement {
  text: string;
  type: "functional" | "nonfunctional" | "constraint";
  priority: "Must" | "Should" | "Could" | "Won't";
  evidenceCodes: string[];
  language: string;
}

export async function runExtraction(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { evidences: true, questions: true, candidates: true },
  });

  const answers = project.questions
    .filter((q) => q.answered && q.answer)
    .map((q) => `Q: ${q.text}\nA: ${q.answer}`)
    .join("\n\n");

  const selected = project.candidates.find((c) => c.selected);
  const evidences = project.evidences;
  const codeToId = new Map(evidences.map((e) => [e.code, e.id]));

  const prompt = `PROJECT BRIEF:
${briefBlock(project.brief)}

SELECTED PROBLEM STATEMENT:
${selected ? `${selected.title} — ${selected.description}` : "(none selected — cover the whole brief)"}

EVIDENCE SOURCES:
${evidenceBlock(evidences)}

STAKEHOLDER ANSWERS:
${answers || "(no answers yet)"}

TASK: Extract 8-12 atomic requirements for the selected problem. Each requirement must be a single testable statement ("The system shall …"). Cite the evidence codes that ground it. Set priority by MoSCoW. Keep the original language of the source when a requirement is grounded in Arabic or code-switched evidence (set language accordingly: "en", "ar-EG" or "codeswitch"); otherwise use English.

Return JSON: {"requirements": [{"text": "...", "type": "functional|nonfunctional|constraint", "priority": "Must|Should|Could|Won't", "evidenceCodes": ["E1"], "language": "en"}]}`;

  const out = parseJson<{ requirements: AgentRequirement[] }>(await callLLM(prompt));
  const rs = (out.requirements ?? []).slice(0, 14);

  // replace previous extraction
  await db.requirement.deleteMany({ where: { projectId } });
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
    const codes = (r.evidenceCodes ?? []).filter((c) => codeToId.has(c));
    const created = await db.requirement.create({
      data: {
        projectId,
        refId,
        text: String(r.text ?? "").slice(0, 800),
        type,
        priority,
        language: ["en", "ar-EG", "codeswitch"].includes(r.language) ? r.language : "en",
        ambiguity: -1,
        order: i,
      },
    });
    for (const c of codes) {
      await db.traceLink.create({
        data: { projectId, requirementId: created.id, evidenceCode: c, note: "cited by extraction agent" },
      });
    }
  }
  await saveArtifact(projectId, "EXTRACTION", out);
}

// ---------- stage 4: AMBIGUITY ----------

export interface AgentAssessment {
  refId: string;
  score: number;
  issues: string;
  suggestion: string;
}

export async function runAmbiguity(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });

  const list = project.reqs
    .map((r) => `${r.refId}: ${r.text}`)
    .join("\n");

  const prompt = `REQUIREMENTS:
${list}

TASK: Score each requirement for ambiguity from 0 (crisp, testable) to 100 (vague, untestable). Flag the specific weak words (e.g. "fast", "user-friendly", "etc", "appropriate", passive voice, missing quantifiers). For any requirement scoring 30 or above, propose a sharper measurable rewrite. Respond for every requirement, in the requirement's own language.

Return JSON: {"assessments": [{"refId": "REQ-01", "score": 42, "issues": "vague term 'fast'", "suggestion": "rewritten requirement"}]}`;

  const out = parseJson<{ assessments: AgentAssessment[] }>(await callLLM(prompt));
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
}

// ---------- stage 5: STORIES ----------

export interface AgentStory {
  refId: string;
  title: string;
  narrative: string;
  acceptance: string[];
  investScore: number;
  investNote: string;
}

export async function runStories(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });

  const list = project.reqs
    .filter((r) => r.status !== "draft" || r.ambiguity < 0 || true) // all current reqs
    .map((r) => `${r.refId} (${r.type}, ${r.priority}): ${r.text}`)
    .join("\n");

  const prompt = `APPROVED REQUIREMENTS:
${list}

TASK: Write one user story per requirement (skip "Won't" priorities). Narrative format: "As a <role>, I want <capability>, so that <benefit>." Give 2-4 acceptance criteria per story, each concrete and testable, in the requirement's own language. Score INVEST quality 0-100 with a one-line note.

Return JSON: {"stories": [{"refId": "REQ-01", "title": "short title", "narrative": "As a...", "acceptance": ["Given... when... then..."], "investScore": 78, "investNote": "..."}]}`;

  const out = parseJson<{ stories: AgentStory[] }>(await callLLM(prompt));
  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));

  await db.userStory.deleteMany({ where: { projectId } });
  let i = 0;
  for (const s of out.stories ?? []) {
    const req = byRef.get(s.refId);
    if (!req || req.priority === "Won't") continue;
    i += 1;
    await db.userStory.create({
      data: {
        projectId,
        requirementId: req.id,
        refId: `US-${String(i).padStart(2, "0")}`,
        title: String(s.title ?? req.refId).slice(0, 200),
        narrative: String(s.narrative ?? "").slice(0, 800),
        acceptance: (s.acceptance ?? []).map(String).join("\n").slice(0, 2000),
        investScore: Math.min(100, Math.max(0, Math.round(Number(s.investScore) || 0))),
        investNote: String(s.investNote ?? "").slice(0, 400),
      },
    });
  }
  await saveArtifact(projectId, "STORIES", out);
}

// ---------- stage 6: CONFLICTS ----------

export interface AgentConflict {
  reqARef: string;
  reqBRef: string;
  kind: "contradiction" | "duplication" | "overlap";
  description: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

export async function runConflicts(projectId: string): Promise<void> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });

  const list = project.reqs.map((r) => `${r.refId}: ${r.text}`).join("\n");

  const prompt = `REQUIREMENTS:
${list}

TASK: Cross-check all requirement pairs for (a) contradictions — cannot both hold, (b) duplications — same need stated twice, (c) overlaps — partially conflicting scopes. Only report genuine findings (0 to 5). For each: the two refIds, kind, a 1-2 sentence explanation, severity, and a suggested resolution in the requirements' own language.

Return JSON: {"conflicts": [{"reqARef": "REQ-01", "reqBRef": "REQ-04", "kind": "contradiction", "description": "...", "severity": "high", "suggestion": "..."}]}`;

  const out = parseJson<{ conflicts: AgentConflict[] }>(await callLLM(prompt));
  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));

  await db.conflict.deleteMany({ where: { projectId } });
  for (const c of (out.conflicts ?? []).slice(0, 6)) {
    const a = byRef.get(c.reqARef);
    const b = byRef.get(c.reqBRef);
    if (!a || !b || a.id === b.id) continue;
    await db.conflict.create({
      data: {
        projectId,
        reqAId: a.id,
        reqBId: b.id,
        kind: ["contradiction", "duplication", "overlap"].includes(c.kind) ? c.kind : "overlap",
        description: String(c.description ?? "").slice(0, 800),
        severity: ["high", "medium", "low"].includes(c.severity) ? c.severity : "medium",
        suggestion: String(c.suggestion ?? "").slice(0, 800),
      },
    });
  }
  await saveArtifact(projectId, "CONFLICTS", out);
}

// ---------- dispatcher ----------

export async function runStageAgent(stage: Stage, projectId: string): Promise<void> {
  switch (stage) {
    case "ELICITATION":
      return runElicitation(projectId);
    case "PROBLEM_SELECTION":
      return runProblemSelection(projectId);
    case "EXTRACTION":
      return runExtraction(projectId);
    case "AMBIGUITY":
      return runAmbiguity(projectId);
    case "STORIES":
      return runStories(projectId);
    case "CONFLICTS":
      return runConflicts(projectId);
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
