import test from "node:test";
import assert from "node:assert/strict";
import { summarizeChangeCostCalibration } from "../src/lib/change-cost-calibration.mjs";

test("empty calibration is explicit and never fabricates a fit", () => {
  assert.deepEqual(summarizeChangeCostCalibration([]), {
    sampleCount: 0, modelVersion: "change-cost-v2", fit: null,
    maeHours: null, rmseHours: null, meanBiasHours: null, rankCorrelation: null,
    readiness: "no_observations",
  });
});

test("fits a transparent linear hours-per-effort relationship and reports zero error for exact data", () => {
  const records = [1, 2, 3, 4].map((points) => ({
    estimate: { effortPoints: points },
    outcome: { actualHours: 2 + 3 * points },
  }));
  const result = summarizeChangeCostCalibration(records);
  assert.equal(result.sampleCount, 4);
  assert.deepEqual(result.fit, { intercept: 2, hoursPerEffortPoint: 3 });
  assert.equal(result.maeHours, 0);
  assert.equal(result.rmseHours, 0);
  assert.equal(result.meanBiasHours, 0);
  assert.equal(result.rankCorrelation, 1);
  assert.equal(result.readiness, "collecting");
  assert.match(result.caveat, /in-sample/);
});

test("uses average ranks for ties and ignores invalid or unpaired records", () => {
  const result = summarizeChangeCostCalibration([
    { estimate: { effortPoints: 1 }, outcome: { actualHours: 2 } },
    { estimate: { effortPoints: 1 }, outcome: { actualHours: 2 } },
    { estimate: { effortPoints: 3 }, outcome: { actualHours: 5 } },
    { estimate: { effortPoints: 0 }, outcome: { actualHours: 4 } },
    { estimate: { effortPoints: 4 } },
    { estimate: { effortPoints: 2 }, outcome: { actualHours: -1 } },
  ]);
  assert.equal(result.sampleCount, 3);
  assert.ok(result.rankCorrelation > 0.9);
});

test("constant estimates do not invent a fitted slope", () => {
  const result = summarizeChangeCostCalibration([
    { estimate: { effortPoints: 2 }, outcome: { actualHours: 3 } },
    { estimate: { effortPoints: 2 }, outcome: { actualHours: 5 } },
  ]);
  assert.equal(result.fit, null);
  assert.equal(result.maeHours, null);
  assert.equal(result.rankCorrelation, null);
});

test("readiness thresholds are explicit and deterministic", () => {
  const rows = Array.from({ length: 30 }, (_, index) => ({
    estimate: { effortPoints: index + 1 },
    outcome: { actualHours: (index + 1) * 1.5 },
  }));
  assert.equal(summarizeChangeCostCalibration(rows.slice(0, 9)).readiness, "collecting");
  assert.equal(summarizeChangeCostCalibration(rows.slice(0, 10)).readiness, "early_signal");
  assert.equal(summarizeChangeCostCalibration(rows).readiness, "review_candidate");
});
