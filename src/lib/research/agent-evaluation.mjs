export const AGENT_EVALUATION_DIMENSIONS = Object.freeze([
  "grounding", "correctness", "completeness", "actionability", "languageFit", "safety", "overall", "reviewerConfidence",
]);

export function validateAgentEvaluationScores(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) throw new TypeError("A score object is required.");
  const result = {};
  for (const dimension of AGENT_EVALUATION_DIMENSIONS) {
    const value = scores[dimension];
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError("Every agent-evaluation score must be an integer from 1 to 5.");
    result[dimension] = value;
  }
  return result;
}

function weightedKappa(left, right) {
  const n = Math.min(left.length, right.length);
  if (n < 2) return null;
  const observed = Array.from({ length: 5 }, () => Array(5).fill(0));
  const lm = Array(5).fill(0), rm = Array(5).fill(0);
  for (let index = 0; index < n; index += 1) {
    const a = left[index] - 1, b = right[index] - 1;
    observed[a][b] += 1; lm[a] += 1; rm[b] += 1;
  }
  let actual = 0, expected = 0;
  for (let a = 0; a < 5; a += 1) for (let b = 0; b < 5; b += 1) {
    const weight = ((a - b) / 4) ** 2;
    actual += weight * observed[a][b] / n;
    expected += weight * (lm[a] / n) * (rm[b] / n);
  }
  return expected === 0 ? null : 1 - actual / expected;
}

/** Descriptive two-rater report for one immutable agent artifact; kappa is not estimable at n=1. */
export function analyzeAgentArtifactReviews(reviews) {
  if (!Array.isArray(reviews) || reviews.length !== 2) throw new RangeError("Exactly two independent reviewers are required.");
  const normalized = reviews.map((review) => validateAgentEvaluationScores(review?.scores));
  const dimensions = {};
  for (const dimension of AGENT_EVALUATION_DIMENSIONS) {
    const a = normalized[0][dimension], b = normalized[1][dimension];
    dimensions[dimension] = {
      mean: Number(((a + b) / 2).toFixed(3)),
      weightedKappa: null,
      exactAgreement: a === b ? 1 : 0,
      absoluteDifference: Math.abs(a - b),
    };
  }
  const disagreement = Object.entries(dimensions)
    .filter(([key, value]) => key !== "reviewerConfidence" && value.absoluteDifference > 1)
    .map(([dimension]) => dimension);
  return {
    reviewerCount: 2, artifactCount: 1, dimensions,
    adjudicationRequired: disagreement.length > 0, disagreementDimensions: disagreement,
    inference: "artifact-level-descriptive-only",
    limitation: "A single artifact cannot estimate inter-rater reliability or agent-level performance. Aggregate across independent artifacts before calculating kappa or comparing agents.",
  };
}

/** Reliability and descriptive quality by stage, across independent agent artifacts. */
export function analyzeAgentEvaluationCohort(records) {
  if (!Array.isArray(records)) throw new TypeError("Agent evaluation records must be an array.");
  const valid = records.map((record) => ({
    stage: typeof record?.stage === "string" && record.stage ? record.stage : "unspecified",
    reviews: Array.isArray(record?.reviews) && record.reviews.length === 2
      ? record.reviews.map((row) => validateAgentEvaluationScores(row?.scores))
      : null,
  })).filter((record) => record.reviews);
  const groups = new Map();
  for (const record of valid) {
    if (!groups.has(record.stage)) groups.set(record.stage, []);
    groups.get(record.stage).push(record);
  }
  const byStage = {};
  for (const [stage, group] of groups) {
    const dimensions = {};
    for (const dimension of AGENT_EVALUATION_DIMENSIONS) {
      const left = group.map((record) => record.reviews[0][dimension]);
      const right = group.map((record) => record.reviews[1][dimension]);
      const all = [...left, ...right];
      dimensions[dimension] = {
        mean: Number((all.reduce((sum, value) => sum + value, 0) / all.length).toFixed(3)),
        weightedKappa: weightedKappa(left, right),
        exactAgreement: left.filter((value, index) => value === right[index]).length / left.length,
        meanAbsoluteDifference: Number((left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length).toFixed(3)),
      };
    }
    byStage[stage] = { nArtifacts: group.length, dimensions };
  }
  return {
    evaluatedArtifacts: valid.length,
    byStage,
    inference: "descriptive-only",
    limitation: "Ratings apply only to artifacts actually reviewed. Compare agents only on matched stage/task distributions and independent projects; these human scores do not replace confidence calibration against human requirement verdicts.",
  };
}
