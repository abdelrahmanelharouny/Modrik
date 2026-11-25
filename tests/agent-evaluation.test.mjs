import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_EVALUATION_DIMENSIONS, validateAgentEvaluationScores, analyzeAgentArtifactReviews } from "../src/lib/research/agent-evaluation.mjs";
const scores = (value) => Object.fromEntries(AGENT_EVALUATION_DIMENSIONS.map((dimension) => [dimension, value]));
test("agent evaluation requires complete 1–5 human scores", () => {
  assert.equal(Object.keys(validateAgentEvaluationScores(scores(4))).length, 8);
  assert.throws(() => validateAgentEvaluationScores({ ...scores(4), safety: 0 }), /integer from 1 to 5/);
  assert.throws(() => validateAgentEvaluationScores({ overall: 5 }), /integer from 1 to 5/);
});
test("agent evaluation reports two-rater agreement and escalates material disagreements", () => {
  const report = analyzeAgentArtifactReviews([{ scores: scores(5) }, { scores: { ...scores(5), correctness: 2 } }]);
  assert.equal(report.reviewerCount, 2);
  assert.equal(report.dimensions.overall.mean, 5);
  assert.equal(report.adjudicationRequired, true);
  assert.ok(report.disagreementDimensions.includes("correctness"));
  assert.equal(report.inference, "artifact-level-descriptive-only");
  assert.throws(() => analyzeAgentArtifactReviews([{ scores: scores(3) }]), /Exactly two/);
});
