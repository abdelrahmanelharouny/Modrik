const DEPTH_WEIGHT = Object.freeze({ 1: 1, 2: 0.68, 3: 0.46, 4: 0.32 });
const EDGE_WEIGHT = Object.freeze({
  conflicts_with: 1.35,
  depends_on: 1.2,
  affected_by: 1.15,
  validates: 0.9,
  refines: 0.85,
  derived_from: 0.85,
});
const KNOWN_PRIORITIES = new Set(["Must", "Should", "Could"]);
const KNOWN_DRIFT = new Set(["none", "changed", "added", "removed", "uncertain"]);
const KNOWN_VERIFICATION = new Set(["supported", "verified", "weak", "unverified", "conflicted", "pending"]);
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }

function requirementRisk(requirement) {
  const factors = [];
  const uncertaintyReasons = [];
  let multiplier = 1;
  if (requirement.priority === "Must") { multiplier += 0.25; factors.push("must_priority"); }
  else if (requirement.priority === "Should") { multiplier += 0.12; factors.push("should_priority"); }
  if (!KNOWN_PRIORITIES.has(requirement.priority)) uncertaintyReasons.push("priority_missing_or_unknown");

  const ambiguity = finite(requirement.ambiguity, -1);
  if (ambiguity >= 70) { multiplier += 0.25; factors.push("high_ambiguity"); }
  else if (ambiguity >= 40) { multiplier += 0.12; factors.push("moderate_ambiguity"); }
  if (!Number.isFinite(requirement.ambiguity) || ambiguity < 0 || ambiguity > 100) uncertaintyReasons.push("ambiguity_missing_or_out_of_range");

  if (requirement.driftStatus && requirement.driftStatus !== "none") { multiplier += 0.2; factors.push("active_drift"); }
  if (!KNOWN_DRIFT.has(requirement.driftStatus)) uncertaintyReasons.push("drift_state_missing_or_unknown");

  if (requirement.verifyStatus && requirement.verifyStatus !== "supported" && requirement.verifyStatus !== "verified") { multiplier += 0.1; factors.push("verification_open"); }
  if (!KNOWN_VERIFICATION.has(requirement.verifyStatus)) uncertaintyReasons.push("verification_state_missing_or_unknown");
  return { multiplier, factors, uncertaintyReasons };
}

/**
 * Deterministic relative effort proxy. The uncertainty band measures missing
 * input coverage; it is not a statistical confidence interval or forecast.
 */
export function estimateChangeCost(root, impacted, requirements) {
  if (!root || typeof root.id !== "string") throw new TypeError("A root requirement is required");
  if (!Array.isArray(impacted) || !Array.isArray(requirements)) throw new TypeError("Impact and requirement collections must be arrays");
  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const unique = new Map();
  for (const item of impacted) if (item && typeof item.id === "string" && item.id !== root.id && byId.has(item.id) && !unique.has(item.id)) unique.set(item.id, item);

  const entries = [{ requirement: root, depth: 0, kinds: [] }];
  for (const item of unique.values()) {
    const kinds = Array.isArray(item.via) ? item.via.map((edge) => edge?.kind).filter((kind) => typeof kind === "string") : [];
    entries.push({ requirement: byId.get(item.id), depth: Math.max(1, Math.min(20, Math.trunc(finite(item.depth, 1)))), kinds });
  }

  let effortPoints = 0, highRiskCount = 0, unknownSignals = 0, totalSignals = 0;
  const factorCounts = new Map(), uncertaintyCounts = new Map(), breakdown = [];
  for (const entry of entries) {
    const risk = requirementRisk(entry.requirement);
    const depthWeight = entry.depth === 0 ? 1 : (DEPTH_WEIGHT[entry.depth] ?? 0.24);
    const depthUnknown = entry.depth > 4;
    const unknownKinds = entry.kinds.filter((kind) => !Object.hasOwn(EDGE_WEIGHT, kind));
    const relationWeight = entry.kinds.length
      ? entry.kinds.reduce((sum, kind) => sum + (EDGE_WEIGHT[kind] ?? 1), 0) / entry.kinds.length
      : 1;
    const uncertaintyReasons = [...risk.uncertaintyReasons];
    if (depthUnknown) uncertaintyReasons.push("depth_weight_extrapolated");
    if (unknownKinds.length) uncertaintyReasons.push("relation_weight_defaulted");
    const baseExposure = depthWeight * relationWeight;
    const contribution = baseExposure * risk.multiplier;
    effortPoints += contribution;
    if (risk.multiplier >= 1.45) highRiskCount += 1;
    for (const factor of risk.factors) factorCounts.set(factor, (factorCounts.get(factor) ?? 0) + 1);
    for (const reason of uncertaintyReasons) uncertaintyCounts.set(reason, (uncertaintyCounts.get(reason) ?? 0) + 1);
    totalSignals += 5;
    unknownSignals += uncertaintyReasons.length;
    breakdown.push({
      requirementId: entry.requirement.id,
      requirementRef: entry.requirement.refId ?? null,
      depth: entry.depth,
      relationKinds: entry.kinds,
      depthWeight,
      relationWeight: Number(relationWeight.toFixed(4)),
      baseExposure: Number(baseExposure.toFixed(4)),
      riskMultiplier: Number(risk.multiplier.toFixed(4)),
      riskUplift: Number((contribution - baseExposure).toFixed(4)),
      effortPoints: Number(contribution.toFixed(4)),
      riskFactors: risk.factors,
      uncertaintyReasons,
    });
  }

  const rounded = Math.round(effortPoints * 100) / 100;
  const uncertaintyScore = totalSignals ? Math.min(1, unknownSignals / totalSignals) : 0;
  const uncertaintyPercent = Math.round(uncertaintyScore * 100);
  const bandPercent = 20 + Math.round(uncertaintyScore * 30);
  const margin = Math.max(0.25, rounded * bandPercent / 100);
  const factors = [...factorCounts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  const uncertaintyFactors = [...uncertaintyCounts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return {
    rootRef: root.refId ?? null,
    affectedRequirements: entries.length - 1,
    directImpact: entries.filter((entry) => entry.depth === 1).length,
    transitiveImpact: entries.filter((entry) => entry.depth > 1).length,
    highRiskRequirements: highRiskCount,
    effortPoints: rounded,
    effortRange: { low: Math.max(0, Math.round((rounded - margin) * 100) / 100), high: Math.round((rounded + margin) * 100) / 100 },
    uncertainty: {
      score: Number(uncertaintyScore.toFixed(4)),
      percent: uncertaintyPercent,
      bandPercent,
      missingSignals: unknownSignals,
      totalSignals,
      factors: uncertaintyFactors,
      interpretation: "Input-coverage indicator only; not probability, confidence, or empirical forecast accuracy.",
    },
    breakdown,
    factors,
    methodology: "depth-weighted typed dependency exposure × requirement risk modifiers; 20–50% planning band widened by missing input coverage",
    caveat: "Relative effort points only — not hours, money, or a validated forecast. The uncertainty band reflects missing input coverage, not a statistical confidence interval. Calibrate against observed change work before operational use.",
  };
}
