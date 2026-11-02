import test from "node:test";
import assert from "node:assert/strict";
import {
  filterEvidenceForAI,
  isAiEligibleEvidence,
  isHumanStakeholderAnswer,
  hasHumanQuestionDecision,
  hasHumanCandidateEdits,
} from "../src/lib/security/data-safety.mjs";
import {
  selectByUtility,
  selectDistinctPoolIndices,
  clampSignalScore,
  deduplicateQuestions,
} from "../src/lib/planner/selection.mjs";

test("only explicitly consented, non-synthetic evidence enters AI context", () => {
  const sources = [
    { id: "allowed", consent: true, origin: "human" },
    { id: "file-allowed", consent: true, origin: "file" },
    { id: "unchecked", consent: false, origin: "human" },
    { id: "missing", origin: "human" },
    { id: "synthetic", consent: true, origin: "synthetic" },
  ];
  assert.deepEqual(filterEvidenceForAI(sources).map((source) => source.id), ["allowed", "file-allowed"]);
  assert.equal(isAiEligibleEvidence(sources[2]), false);
});

test("wind-tunnel and assumption answers never count as real stakeholder answers", () => {
  const real = { answered: true, resolution: "answered", answer: "We need two roles.", answerSource: "human" };
  const synthetic = { answered: true, resolution: "answered", answer: "[synthetic · wind tunnel] plausible answer", answerSource: "synthetic" };
  const assumption = { answered: true, resolution: "proceed_with_uncertainty", answer: "assume X", answerSource: "assumption" };
  assert.equal(isHumanStakeholderAnswer(real), true);
  assert.equal(isHumanStakeholderAnswer(synthetic), false);
  assert.equal(isHumanStakeholderAnswer(assumption), false);
  assert.equal(hasHumanQuestionDecision([synthetic]), false);
  assert.equal(hasHumanQuestionDecision([real]), true);
  assert.equal(hasHumanQuestionDecision([assumption]), true);
});

test("candidate regeneration detects human selection and manual scoring", () => {
  assert.equal(hasHumanCandidateEdits([{ selected: false, impact: 3, effort: 3 }]), false);
  assert.equal(hasHumanCandidateEdits([{ selected: true, impact: 3, effort: 3 }]), true);
  assert.equal(hasHumanCandidateEdits([{ selected: false, impact: 4, effort: 3 }]), true);
});

test("utility selection never exceeds budget to fill the requested count", () => {
  const pool = [
    { text: "high", askCost: 5, utility: { utility: 100 } },
    { text: "low", askCost: 1, utility: { utility: 90 } },
    { text: "next", askCost: 2, utility: { utility: 80 } },
  ];
  const selected = selectByUtility(pool, 5, 3);
  assert.deepEqual(selected.map((q) => q.text), ["low", "next"]);
  assert.ok(selected.reduce((total, q) => total + q.askCost, 0) <= 3);
});

test("planner index selection ignores invalid and duplicate indices", () => {
  assert.deepEqual(selectDistinctPoolIndices([3, 3, 0, 99, 1, 2], 4, 5), [2, 0, 1]);
});

test("planner signal scores are finite and clamped to the defined 1..5 range", () => {
  assert.equal(clampSignalScore(99), 5);
  assert.equal(clampSignalScore(0), 1);
  assert.equal(clampSignalScore(Number.NaN), 3);
});

test("planner removes duplicate questions after whitespace and case normalization", () => {
  const questions = [
    { text: "  Who are the users? " },
    { text: "who   are THE users?" },
    { text: "Which systems must integrate?" },
    { text: "   " },
  ];
  assert.deepEqual(deduplicateQuestions(questions).map((q) => q.text), [
    "  Who are the users? ",
    "Which systems must integrate?",
  ]);
});
