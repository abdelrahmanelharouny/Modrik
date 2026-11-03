const DEPTH_WEIGHT = Object.freeze({ 1: 1, 2: 0.68, 3: 0.46, 4: 0.32 });
const EDGE_WEIGHT = Object.freeze({
  conflicts_with: 1.35,
  depends_on: 1.2,
  affected_by: 1.15,
  validates: 0.9,
  refines: 0.85,
  derived_from: 0.85,
});
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function requirementRisk(requirement) {
  const factors = [];
  let multiplier = 1;
  if (requirement.priority === "Must") { multiplier += 0.25; factors.push("must_priority"); }
  else if (requirement.priority === "Should") { multiplier += 0.12; factors.push("should_priority"); }
  const ambiguity = finite(requirement.ambiguity, -1);
  if (ambiguity >= 70) { multiplier += 0.25; factors.push("high_ambiguity"); }
  else if (ambiguity >= 40) { multiplier += 0.12; factors.push("moderate_ambiguity"); }
  if (requirement.driftStatus && requirement.driftStatus !== "none") { multiplier += 0.2; factors.push("active_drift"); }
  if (requirement.verifyStatus && requirement.verifyStatus !== "supported" && requirement.verifyStatus !== "verified") { multiplier += 0.1; factors.push("verification_open"); }
  return { multiplier, factors };
}
/** Relative effort heuristic only; never interpret these points as hours or money. */
export function estimateChangeCost(root, impacted, requirements) {
  if (!root || typeof root.id !== "string") throw new TypeError("A root requirement is required");
  if (!Array.isArray(impacted) || !Array.isArray(requirements)) throw new TypeError("Impact and requirement collections must be arrays");
  const byId = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const unique = new Map();
  for (const item of impacted) if (item && typeof item.id === "string" && item.id !== root.id && byId.has(item.id) && !unique.has(item.id)) unique.set(item.id, item);
  const entries = [{ requirement: root, depth: 0, kinds: [] }];
  for (const item of unique.values()) {
    const requirement = byId.get(item.id);
    const kinds = Array.isArray(item.via) ? item.via.map((edge) => edge?.kind).filter((kind) => typeof kind === "string") : [];
    entries.push({ requirement, depth: Math.max(1, Math.min(20, Math.trunc(finite(item.depth, 1)))), kinds });
  }
  let effortPoints = 0, highRiskCount = 0;
  const factorCounts = new Map();
  for (const entry of entries) {
    const risk = requirementRisk(entry.requirement);
    const depthWeight = entry.depth === 0 ? 1 : (DEPTH_WEIGHT[entry.depth] ?? 0.24);
    const relationWeight = entry.kinds.length ? entry.kinds.reduce((sum, kind) => sum + (EDGE_WEIGHT[kind] ?? 1), 0) / entry.kinds.length : 1;
    effortPoints += depthWeight * relationWeight * risk.multiplier;
    if (risk.multiplier >= 1.45) highRiskCount += 1;
    for (const factor of risk.factors) factorCounts.set(factor, (factorCounts.get(factor) ?? 0) + 1);
  }
  const rounded = Math.round(effortPoints * 100) / 100;
  const margin = Math.max(0.25, rounded * 0.2);
  const factors = [...factorCounts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    rootRef: root.refId, affectedRequirements: entries.length - 1,
    directImpact: entries.filter((entry) => entry.depth === 1).length,
    transitiveImpact: entries.filter((entry) => entry.depth > 1).length,
    highRiskRequirements: highRiskCount, effortPoints: rounded,
    effortRange: { low: Math.max(0, Math.round((rounded - margin) * 100) / 100), high: Math.round((rounded + margin) * 100) / 100 },
    factors, methodology: "depth-weighted typed dependency exposure × requirement risk modifiers; ±20% planning band",
    caveat: "Relative effort points only — not hours, cost, or a validated forecast. Calibrate against observed change work before operational use.",
  };
}
