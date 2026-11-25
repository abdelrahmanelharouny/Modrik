import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_EVALUATION_DIMENSIONS, validateAgentEvaluationScores, analyzeAgentArtifactReviews, analyzeAgentEvaluationCohort } from "../src/lib/research/agent-evaluation.mjs";
const scores = (value) => Object.fromEntries(AGENT_EVALUATION_DIMENSIONS.map((dimension) => [dimension, value]));
test("agent evaluation requires complete 1–5 human scores", () => {
  assert.equal(Object.keys(validateAgentEvaluationScores(scores(4))).length, 8);
  assert.throws(() => validateAgentEvaluationScores({ ...scores(4), safety: 0 }), /integer from 1 to 5/);
  assert.throws(() => validateAgentEvaluationScores({ overall: 5 }), /integer from 1 to 5/);
});
test("one agent artifact remains descriptive and does not fabricate an inter-rater statistic", () => {
  const report = analyzeAgentArtifactReviews([{ scores: scores(5) }, { scores: { ...scores(5), correctness: 2 } }]);
  assert.equal(report.artifactCount, 1);
  assert.equal(report.dimensions.overall.weightedKappa, null);
  assert.equal(report.dimensions.overall.mean, 5);
  assert.equal(report.adjudicationRequired, true);
  assert.ok(report.disagreementDimensions.includes("correctness"));
});
test("cohort weighted kappa is calculated only across independent artifacts", () => {
  const ratings = [[1,1],[2,3],[4,4],[5,5]].map(([a,b]) => ({
    stage: "EXTRACTION",
    reviews: [{ scores: scores(a) }, { scores: scores(b) }],
  }));
  const report = analyzeAgentEvaluationCohort(ratings);
  assert.equal(report.evaluatedArtifacts, 4);
  assert.equal(report.byStage.EXTRACTION.nArtifacts, 4);
  assert.ok(Number.isFinite(report.byStage.EXTRACTION.dimensions.overall.weightedKappa));
  assert.equal(report.inference, "descriptive-only");
});
