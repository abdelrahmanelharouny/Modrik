// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — DECOMPOSABLE HEALTH & DEBT (dev item 11)
//
// No magic single score. Every debt dimension is computed
// DETERMINISTICALLY from the database (dynamicity rule — numbers
// are never invented by an LLM), each with its per-requirement
// contribution list so the human can drill down to the exact
// requirement carrying the debt. The LLM only writes the narrative
// around these computed numbers (runHealth in agents.ts).
//
// Dimensions:
//   ambiguity       — vague/untestable requirements (score >= 30)
//   verification    — weak or unverified grounding
//   uncertainty     — assumptions carried without asking
//   conflict        — open conflicts weighted by severity
//   traceability    — requirements with no evidence links
//   executability   — scenarios the baseline cannot define
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { computeHealthScores } from "@/lib/health/metrics.mjs";

export interface DebtContribution {
  refId: string;
  text: string;
  amount: number; // dimension-specific contribution (e.g. ambiguity score)
  note: string;
}

export interface DebtDimension {
  id: string;
  label: string;
  score: number | null; // null means not assessed; otherwise 0 (clean) .. 100 (deep debt)
  assessed: boolean;
  coverage: number | null; // percentage of records actually measured
  detail: string;
  contributions: DebtContribution[];
}

export interface DebtProfile {
  dimensions: DebtDimension[];
  headline: {
    totalRequirements: number;
    avgAmbiguity: number | null;
    flaggedAmbiguity: number;
    weakVerification: number;
    unverified: number;
    assumptions: number;
    openConflicts: number;
    untraced: number;
    undefinedScenarios: number;
    definedScenarios: number;
  };
}

const SEVERITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

export async function computeDebtProfile(projectId: string): Promise<DebtProfile> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      reqs: { orderBy: { order: "asc" }, include: { links: true } },
      questions: true,
      conflicts: true,
      stories: true,
      execScenarios: true,
      artifacts: { where: { stage: "CONFLICTS" }, select: { id: true }, take: 1 },
    },
  });

  const reqs = project.reqs;
  const total = reqs.length;
  const scores = computeHealthScores({
    requirements: reqs,
    questions: project.questions,
    conflicts: project.conflicts,
    scenarios: project.execScenarios,
    conflictDetectionComplete: project.artifacts.length > 0,
  });

  const assessed = reqs.filter((r) => r.ambiguity >= 0 && r.ambiguity <= 100);
  const avgAmbiguity = assessed.length
    ? Math.round(assessed.reduce((sum, r) => sum + r.ambiguity, 0) / assessed.length)
    : null;
  const ambiguous = assessed.filter((r) => r.ambiguity >= 30);
  const weak = reqs.filter((r) => r.verifyStatus === "weak");
  const unverified = reqs.filter((r) => r.verifyStatus === "unverified");
  const uncertain = project.questions.filter((q) => q.resolution === "proceed_with_uncertainty");
  const open = project.conflicts.filter((conflict) => conflict.status === "open");
  const untraced = reqs.filter((requirement) => requirement.links.length === 0);
  const undef = project.execScenarios.filter((scenario) => scenario.resolution === "undefined");
  const definedCount = project.execScenarios.filter((scenario) => scenario.resolution === "defined").length;

  const dimension = (
    id: string,
    label: string,
    detail: string,
    metric: { score: number | null; assessed: boolean; coverage: number | null },
    contributions: DebtContribution[]
  ): DebtDimension => ({
    id,
    label,
    detail,
    score: metric.score,
    assessed: metric.assessed,
    coverage: metric.coverage,
    contributions,
  });

  const ambiguity = dimension(
    "ambiguity",
    "Ambiguity debt",
    scores.ambiguity.assessed
      ? `${ambiguous.length} of ${total} requirement(s) flagged >= 30; measured ${assessed.length}/${total}`
      : "Ambiguity not yet assessed",
    scores.ambiguity,
    ambiguous.map((r) => ({ refId: r.refId, text: r.text, amount: r.ambiguity, note: r.ambiguityNote ?? "" }))
  );

  const verification = dimension(
    "verification",
    "Verification debt",
    total ? `${weak.length} weak + ${unverified.length} unverified of ${total}` : "No requirements to verify",
    scores.verification,
    [...weak, ...unverified].map((r) => ({
      refId: r.refId,
      text: r.text,
      amount: r.verifyStatus === "weak" ? 100 : 50,
      note: r.verifyNote ?? (r.verifyStatus === "unverified" ? "Verifier has not produced a result" : ""),
    }))
  );

  const uncertainty = dimension(
    "uncertainty",
    "Uncertainty ledger debt",
    scores.uncertainty.assessed
      ? `${uncertain.length} assumption(s) among ${scores.counts.decidedQuestions} explicit decisions; ${scores.counts.pendingQuestions} still pending`
      : "No reviewed elicitation decisions yet",
    scores.uncertainty,
    uncertain.map((q) => ({
      refId: "LEDGER",
      text: q.text,
      amount: (q.askCost ?? 3) * 20,
      note: q.fallbackAssumption ?? "",
    }))
  );

  const conflict = dimension(
    "conflict",
    "Conflict pressure",
    !scores.conflict.assessed
      ? "Conflict analysis has not been run"
      : open.length
        ? `${open.length} open conflict(s) among ${project.conflicts.length} detected`
        : project.conflicts.length
          ? "All conflicts resolved"
          : "No conflicts detected",
    scores.conflict,
    open.map((item) => {
      const a = reqs.find((r) => r.id === item.reqAId);
      const b = reqs.find((r) => r.id === item.reqBId);
      const severityWeight = SEVERITY_WEIGHT[item.severity] ?? 2;
      return {
        refId: `${a?.refId ?? "?"} ↔ ${b?.refId ?? "?"}`,
        text: item.description,
        amount: severityWeight * 33,
        note: `${item.kind}${item.taxonomy ? ` · ${item.taxonomy}` : ""} — severity ${item.severity}`,
      };
    })
  );

  const traceability = dimension(
    "traceability",
    "Traceability debt",
    total ? `${untraced.length} of ${total} requirement(s) have no evidence link` : "No requirements yet",
    scores.traceability,
    untraced.map((r) => ({
      refId: r.refId,
      text: r.text,
      amount: 100,
      note: "No evidence citations — grounding unproven",
    }))
  );

  const executability = dimension(
    "executability",
    "Executability debt",
    project.execScenarios.length
      ? `${undef.length} of ${project.execScenarios.length} scenario(s) are undefined`
      : "Executability simulator has not populated this dimension",
    scores.executability,
    undef.map((scenario) => ({
      refId: scenario.refId,
      text: `${scenario.given} → ${scenario.when} → ${scenario.then}`,
      amount: 100,
      note: scenario.discovery ?? scenario.undefinedReason ?? "",
    }))
  );

  return {
    dimensions: [ambiguity, verification, uncertainty, conflict, traceability, executability],
    headline: {
      totalRequirements: total,
      avgAmbiguity,
      flaggedAmbiguity: ambiguous.length,
      weakVerification: weak.length,
      unverified: unverified.length,
      assumptions: uncertain.length,
      openConflicts: open.length,
      untraced: untraced.length,
      undefinedScenarios: undef.length,
      definedScenarios: definedCount,
    },
  };
}
