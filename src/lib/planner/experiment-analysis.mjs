const ARMS = ["single_shot", "random", "llm", "impact_aware"];
const METRICS = {
  avgUtility: { min: 0, max: 625, direction: 1 },
  utilityPerCost: { min: 0, max: 625, direction: 1 },
  evidenceCoverage: { min: 0, max: 100, direction: 1 },
  redundancyRate: { min: 0, max: 100, direction: -1 },
  dialectFit: { min: 0, max: 100, direction: 1 },
};

function hashSeed(seed) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return state >>> 0 || 0x6d2b79f5;
}

function createRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function validMetrics(metrics) {
  return metrics && typeof metrics === "object" && Object.entries(METRICS).every(([key, rule]) =>
    Number.isFinite(metrics[key]) && metrics[key] >= rule.min && metrics[key] <= rule.max
  );
}

/**
 * Paired, experiment-level bootstrap analysis.
 * Rows are PlannerRun records (one row per arm per experiment). Incomplete or
 * duplicate experiment arms are excluded rather than imputed.
 */
export function analyzePlannerExperiments(rows, options = {}) {
  const minExperiments = Number.isInteger(options.minExperiments) && options.minExperiments >= 2
    ? options.minExperiments : 10;
  const bootstrapSamples = Number.isInteger(options.bootstrapSamples) && options.bootstrapSamples >= 100
    ? Math.min(options.bootstrapSamples, 20000) : 2000;
  const seed = typeof options.seed === "string" && options.seed ? options.seed : "modrik-planner-analysis-v1";
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.experimentId !== "string" || !row.experimentId ||
        !ARMS.includes(row.arm) || !validMetrics(row.metrics)) continue;
    if (!groups.has(row.experimentId)) groups.set(row.experimentId, new Map());
    const group = groups.get(row.experimentId);
    if (group.has(row.arm)) group.set(row.arm, null); // duplicate arm invalidates the whole paired unit
    else group.set(row.arm, row.metrics);
  }

  const paired = [];
  let excludedExperiments = 0;
  for (const group of groups.values()) {
    if (ARMS.every((arm) => group.has(arm) && group.get(arm))) paired.push(group);
    else excludedExperiments++;
  }

  const comparisons = {};
  for (const comparator of ["single_shot", "random", "llm"]) {
    comparisons[comparator] = {};
    for (const [metric, rule] of Object.entries(METRICS)) {
      const differences = paired.map((group) =>
        (group.get("impact_aware")[metric] - group.get(comparator)[metric]) * rule.direction
      );
      const mean = differences.length
        ? differences.reduce((sum, value) => sum + value, 0) / differences.length
        : null;
      if (differences.length < minExperiments) {
        comparisons[comparator][metric] = {
          n: differences.length,
          meanImprovement: mean === null ? null : +mean.toFixed(4),
          ci95: null,
          bootstrapPositiveProbability: null,
          verdict: "insufficient-data",
        };
        continue;
      }

      const random = createRandom(`${seed}:${comparator}:${metric}`);
      const samples = new Array(bootstrapSamples);
      for (let sample = 0; sample < bootstrapSamples; sample++) {
        let sum = 0;
        for (let i = 0; i < differences.length; i++) {
          sum += differences[Math.floor(random() * differences.length)];
        }
        samples[sample] = sum / differences.length;
      }
      samples.sort((a, b) => a - b);
      const low = quantile(samples, 0.025);
      const high = quantile(samples, 0.975);
      comparisons[comparator][metric] = {
        n: differences.length,
        meanImprovement: +mean.toFixed(4),
        ci95: [+low.toFixed(4), +high.toFixed(4)],
        bootstrapPositiveProbability: +(samples.filter((value) => value > 0).length / samples.length).toFixed(4),
        verdict: low > 0 ? "evidence-of-improvement" : high < 0 ? "evidence-of-regression" : "inconclusive",
      };
    }
  }

  return {
    pairedExperiments: paired.length,
    excludedExperiments,
    minExperiments,
    bootstrapSamples,
    seed,
    comparisons,
    interpretation: "Paired bootstrap intervals quantify uncertainty across independent experiment runs; they are not a substitute for independent human labels or a preregistered study. No superiority claim is warranted when a comparison is insufficient-data or inconclusive.",
  };
}
