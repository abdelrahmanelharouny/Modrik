import test from "node:test";
import assert from "node:assert/strict";
import { computeHealthScores } from "../src/lib/health/metrics.mjs";

test("health marks dimensions not assessed instead of reporting misleading zero debt", () => {
  const result = computeHealthScores();
  for (const key of ["ambiguity", "verification", "uncertainty", "conflict", "traceability", "executability"]) {
    assert.equal(result[key].score, null, key);
    assert.equal(result[key].assessed, false, key);
  }
});

test("ambiguity score uses assessed requirements only and reports coverage", () => {
  const result = computeHealthScores({
    requirements: [
      { ambiguity: 60, verifyStatus: "supported", links: [{ id: "l1", evidenceId: "ev1" }] },
      { ambiguity: -1, verifyStatus: "supported", links: [{ id: "l2", evidenceId: null }] },
      { ambiguity: 40, verifyStatus: "weak", links: [] },
    ],
  });
  assert.equal(result.ambiguity.score, 50);
  assert.equal(result.ambiguity.coverage, 67);
  assert.equal(result.counts.assessedAmbiguity, 2);
  assert.equal(result.traceability.score, 67);
});

test("uncertainty excludes pending and synthetic-only answers from the denominator", () => {
  const result = computeHealthScores({
    questions: [
      { resolution: "pending" },
      { resolution: "answered", answerSource: "synthetic", answer: "[synthetic · wind tunnel] ..." },
      { resolution: "answered", answerSource: "human", answer: "we need SSO" },
      { resolution: "proceed_with_uncertainty", answerSource: "assumption" },
      { resolution: "skipped", answerSource: "skipped" },
    ],
  });
  assert.equal(result.uncertainty.score, 33);
  assert.equal(result.uncertainty.coverage, 60);
  assert.equal(result.counts.pendingQuestions, 1);
});

test("conflict score is severity-normalized and only assessed after conflict analysis ran", () => {
  const conflicts = [
    { status: "open", severity: "high" },
    { status: "resolved", severity: "high" },
    { status: "open", severity: "low" },
  ];
  assert.equal(computeHealthScores({ conflicts }).conflict.score, null);
  const result = computeHealthScores({ conflicts, conflictDetectionComplete: true });
  assert.equal(result.conflict.score, 44);
  assert.equal(result.counts.openConflicts, 2);
});

test("executability is not assessed before scenarios exist", () => {
  assert.equal(computeHealthScores({ scenarios: [] }).executability.score, null);
  const result = computeHealthScores({ scenarios: [
    { resolution: "defined" },
    { resolution: "undefined" },
  ] });
  assert.equal(result.executability.score, 50);
});

test("legacy code-only and deleted-evidence trace links do not count as grounded", () => {
  const result = computeHealthScores({
    requirements: [
      { verifyStatus: "supported", links: [{ id: "legacy", evidenceCode: "EV-01", evidenceId: null }] },
      { verifyStatus: "supported", links: [{ id: "active", evidenceCode: "EV-02", evidenceId: "evidence-2" }] },
    ],
  });
  assert.equal(result.traceability.score, 50);
  assert.equal(result.counts.untraced, 1);
});
