// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — REQUIREMENT EXECUTABILITY SIMULATOR (dev item 8)
//
// For the requirement baseline, the simulator generates concrete
// executable scenarios (Given / When / Then) and then runs a
// resolution pass: can the expected behaviour be fully determined
// from the current requirement set?
//
//   resolution "defined"   → the baseline answers the scenario
//   resolution "undefined" → the baseline is SILENT — recorded as a
//     requirement DISCOVERY (with the clarifying question that would
//     define it), not a failure. UNDEFINED is the discovery channel.
//
// Orphan discoveries (no single owning requirement) get GAP-nn refIds.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { getProvider, type ChatMessage } from "@/lib/providers";
import { PROMPT_VERSION } from "@/lib/agents";

const SYSTEM =
  "You are the Executability Simulator inside Modrik (مدرك), an evidence-based requirements " +
  "engineering assistant. You think like a rigorous test designer. Reply with VALID JSON ONLY — " +
  "no markdown fences, no commentary.";

interface RawScenario {
  refId: string;
  given: string;
  when: string;
  then: string;
  resolution: "defined" | "undefined";
  undefinedReason?: string;
  discovery?: string;
  owningRef?: string;
}

export interface ExecResult {
  scenarios: number;
  undefinedCount: number;
  discoveries: number;
}

export async function runExecutability(projectId: string): Promise<ExecResult> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } } },
  });
  const usage = { calls: 0, latencyMs: 0, estTokens: 0 };
  const provider = await getProvider();

  const reqList = project.reqs.map((r) => `${r.refId}: ${r.text}`).join("\n");
  if (!reqList) return { scenarios: 0, undefinedCount: 0, discoveries: 0 };

  // Pass 1 — generate concrete scenarios and immediately judge resolvability
  const prompt = `REQUIREMENT BASELINE:
${reqList}

TASK (two jobs in one pass):

JOB A — SIMULATE: for 8-10 of the requirements above, write ONE concrete executable scenario each, in the form:
- given: the initial system state (concrete, with data values)
- when: a specific actor action or event
- then: the expected observable outcome

JOB B — RESOLVE: for each scenario, judge whether the "then" outcome is FULLY determined by the requirement baseline above:
- "defined": an existing requirement(s) completely determines the outcome (name the strongest owner in owningRef)
- "undefined": the baseline is silent, ambiguous or only partially determines the outcome — the system cannot answer what should happen (leave owningRef empty)

For every "undefined" scenario, JOB C: write the ONE clarifying question or missing requirement that, if answered, would make the scenario defined (field "discovery") — in the same language as the requirement it targets. These are requirement DISCOVERIES, not errors: they expose what the baseline has not yet specified.

Return JSON: {"scenarios": [{"refId": "REQ-03", "given": "...", "when": "...", "then": "...", "resolution": "defined|undefined", "undefinedReason": "only for undefined", "discovery": "only for undefined", "owningRef": "REQ-03"}]}`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ];
  const t0 = Date.now();
  let raw: string;
  try {
    raw = await provider.complete(messages);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    raw = await provider.complete(messages);
  }
  usage.calls = 1;
  usage.latencyMs = Date.now() - t0;
  usage.estTokens = Math.ceil((prompt.length + raw.length) / 4);

  let parsed: { scenarios?: RawScenario[] };
  try {
    let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = text.search(/[{[]/);
    if (start > 0) text = text.slice(start);
    const lastBrace = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (lastBrace > 0) text = text.slice(0, lastBrace + 1);
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Executability simulator returned unparseable output");
  }

  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));
  await db.execScenario.deleteMany({ where: { projectId } });

  let undefinedCount = 0;
  let gapIndex = 0;
  const scenarios = (parsed.scenarios ?? []).slice(0, 12);
  for (const s of scenarios) {
    if (!s.given || !s.when || !s.then) continue;
    const isUndefined = s.resolution === "undefined";
    let requirementId: string | null = null;
    let refId = String(s.refId ?? "").toUpperCase();
    const owner = byRef.get(String(s.owningRef ?? "").toUpperCase());
    if (owner && !isUndefined) {
      requirementId = owner.id;
      refId = owner.refId;
    } else if (byRef.has(refId)) {
      requirementId = byRef.get(refId)!.id;
    } else if (isUndefined && !owner) {
      gapIndex += 1;
      refId = `GAP-${String(gapIndex).padStart(2, "0")}`;
    }
    if (isUndefined) undefinedCount += 1;
    await db.execScenario.create({
      data: {
        projectId,
        requirementId,
        refId: refId || `GAP-${String(++gapIndex).padStart(2, "0")}`,
        given: String(s.given).slice(0, 600),
        when: String(s.when).slice(0, 600),
        then: String(s.then).slice(0, 600),
        resolution: isUndefined ? "undefined" : "defined",
        undefinedReason: isUndefined ? String(s.undefinedReason ?? "").slice(0, 500) : null,
        discovery: isUndefined ? String(s.discovery ?? "").slice(0, 500) || null : null,
      },
    });
  }

  const result: ExecResult = {
    scenarios: scenarios.length,
    undefinedCount,
    discoveries: undefinedCount,
  };
  await logDecision(
    projectId,
    "LIFECYCLE",
    "agent",
    "executability_run",
    `Executability simulation: ${result.scenarios} scenarios, ${undefinedCount} UNDEFINED — each undefined is a discovery candidate.`
  );
  await db.artifact.create({
    data: {
      projectId,
      stage: "EXECUTABILITY",
      kind: "json",
      content: JSON.stringify({ ...result, scenarios: parsed.scenarios ?? [] }).slice(0, 20000),
    },
  });
  try {
    await db.pipelineRun.updateMany({
      where: { projectId, stage: "EXECUTABILITY", status: "running" },
      data: { status: "done", latencyMs: usage.latencyMs, estTokens: usage.estTokens, promptVersion: PROMPT_VERSION },
    });
  } catch {
    /* standalone instrument: pipeline row optional */
  }
  return result;
}

export async function getExecScenarios(projectId: string) {
  const rows = await db.execScenario.findMany({
    where: { projectId },
    orderBy: [{ resolution: "desc" }, { createdAt: "asc" }],
    include: { requirement: { select: { refId: true, text: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    refId: s.refId,
    requirement: s.requirement ? { refId: s.requirement.refId, text: s.requirement.text } : null,
    given: s.given,
    when: s.when,
    then: s.then,
    resolution: s.resolution,
    undefinedReason: s.undefinedReason,
    discovery: s.discovery,
    createdAt: s.createdAt,
  }));
}
