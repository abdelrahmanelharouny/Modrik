// ─────────────────────────────────────────────────────────────
// RequirementPilot — DECOMPOSABLE HEALTH & DEBT (dev item 11)
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

export interface DebtContribution {
  refId: string;
  text: string;
  amount: number; // dimension-specific contribution (e.g. ambiguity score)
  note: string;
}

export interface DebtDimension {
  id: string;
  label: string;
  score: number; // 0 (clean) .. 100 (deep debt)
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
    },
  });

  const reqs = project.reqs;
  const total = reqs.length;
  const assessed = reqs.filter((r) => r.ambiguity >= 0);
  const avgAmbiguity = assessed.length
    ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length)
    : null;

  // ── ambiguity debt ────────────────────────────────────────
  const ambiguous = assessed.filter((r) => r.ambiguity >= 30);
  const ambiguityScore = total ? Math.round((ambiguous.reduce((s, r) => s + (r.ambiguity - 30 + 30), 0) / (total * 100)) * 100) : 0;
  const ambiguity: DebtDimension = {
    id: "ambiguity",
    label: "Ambiguity debt",
    score: Math.min(100, ambiguityScore),
    detail: ambiguous.length
      ? `${ambiguous.length} of ${total} requirement(s) scored >= 30 ambiguity`
      : avgAmbiguity === null
        ? "Ambiguity not yet assessed"
        : "All assessed requirements are crisp (< 30)",
    contributions: ambiguous.map((r) => ({
      refId: r.refId,
      text: r.text,
      amount: r.ambiguity,
      note: r.ambiguityNote ?? "",
    })),
  };

  // ── verification debt ─────────────────────────────────────
  const weak = reqs.filter((r) => r.verifyStatus === "weak");
  const unverified = reqs.filter((r) => r.verifyStatus === "unverified");
  const verificationScore = total
    ? Math.round(((weak.length * 1 + unverified.length * 0.5) / total) * 100)
    : 0;
  const verification: DebtDimension = {
    id: "verification",
    label: "Verification debt",
    score: Math.min(100, verificationScore),
    detail: `${weak.length} weak + ${unverified.length} unverified of ${total}`,
    contributions: [...weak, ...unverified].map((r) => ({
      refId: r.refId,
      text: r.text,
      amount: r.verifyStatus === "weak" ? 100 : 50,
      note: r.verifyNote ?? (r.verifyStatus === "unverified" ? "Critic pass has not judged this requirement yet" : ""),
    })),
  };

  // ── uncertainty debt (assumptions carried) ────────────────
  const uncertain = project.questions.filter((q) => q.resolution === "proceed_with_uncertainty");
  const uncertainty: DebtDimension = {
    id: "uncertainty",
    label: "Uncertainty ledger debt",
    score: Math.min(100, uncertain.length * 15),
    detail: uncertain.length
      ? `${uncertain.length} assumption(s) carried without asking`
      : "No assumptions carried — every unknown was asked or explicitly skipped",
    contributions: uncertain.map((q) => ({
      refId: "LEDGER",
      text: q.text,
      amount: (q.askCost ?? 3) * 20,
      note: q.fallbackAssumption ?? "",
    })),
  };

  // ── conflict debt ─────────────────────────────────────────
  const open = project.conflicts.filter((c) => c.status === "open");
  const conflictWeight = open.reduce((s, c) => s + (SEVERITY_WEIGHT[c.severity] ?? 2), 0);
  const conflict: DebtDimension = {
    id: "conflict",
    label: "Conflict pressure",
    score: Math.min(100, conflictWeight * 10),
    detail: open.length
      ? `${open.length} open conflict(s) — weighted pressure ${conflictWeight}`
      : project.conflicts.length
        ? "All conflicts resolved"
        : "No conflicts detected",
    contributions: open.map((c) => {
      const a = reqs.find((r) => r.id === c.reqAId);
      const b = reqs.find((r) => r.id === c.reqBId);
      return {
        refId: `${a?.refId ?? "?"} ↔ ${b?.refId ?? "?"}`,
        text: c.description,
        amount: (SEVERITY_WEIGHT[c.severity] ?? 2) * 33,
        note: `${c.kind}${c.taxonomy ? ` · ${c.taxonomy}` : ""} — severity ${c.severity}`,
      };
    }),
  };

  // ── traceability debt ─────────────────────────────────────
  const untraced = reqs.filter((r) => r.links.length === 0);
  const traceability: DebtDimension = {
    id: "traceability",
    label: "Traceability debt",
    score: total ? Math.round((untraced.length / total) * 100) : 0,
    detail: total ? `${untraced.length} of ${total} requirement(s) have no evidence link` : "No requirements yet",
    contributions: untraced.map((r) => ({
      refId: r.refId,
      text: r.text,
      amount: 100,
      note: "No evidence citations — grounding unproven",
    })),
  };

  // ── executability debt ────────────────────────────────────
  const undef = project.execScenarios.filter((s) => s.resolution === "undefined");
  const definedCount = project.execScenarios.filter((s) => s.resolution === "defined").length;
  const execScore = project.execScenarios.length
    ? Math.round((undef.length / project.execScenarios.length) * 100)
    : 0;
  const executability: DebtDimension = {
    id: "executability",
    label: "Executability debt",
    score: execScore,
    detail: project.execScenarios.length
      ? `${undef.length} of ${project.execScenarios.length} simulated scenario(s) UNDEFINED — each is a discovery candidate`
      : "Run the executability simulator to populate this dimension",
    contributions: undef.map((s) => ({
      refId: s.refId,
      text: `${s.given} → ${s.when} → ${s.then}`,
      amount: 100,
      note: s.discovery ?? s.undefinedReason ?? "",
    })),
  };

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
