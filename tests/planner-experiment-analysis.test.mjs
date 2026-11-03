import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlannerExperiments } from "../src/lib/planner/experiment-analysis.mjs";

const arms = ["single_shot", "random", "llm", "impact_aware"];
function rowsFor(id, impact = 90, baseline = 70) {
  return arms.map((arm) => ({
    experimentId: id,
    arm,
    metrics: {
      avgUtility: arm === "impact_aware" ? impact : baseline,
      utilityPerCost: arm === "impact_aware" ? impact / 2 : baseline / 2,
      evidenceCoverage: arm === "impact_aware" ? impact : baseline,
      redundancyRate: arm === "impact_aware" ? 100 - impact : 100 - baseline,
      dialectFit: arm === "impact_aware" ? impact : baseline,
    },
  }));
}

test("paired bootstrap returns deterministic improvement evidence for repeated independent runs", () => {
  const rows = Array.from({ length: 12 }, (_, i) => rowsFor("exp-" + i, 90 + (i % 3), 65 + (i % 3))).flat();
  const first = analyzePlannerExperiments(rows, { bootstrapSamples: 500, seed: "fixed" });
  const second = analyzePlannerExperiments(rows, { bootstrapSamples: 500, seed: "fixed" });
  assert.deepEqual(first, second);
  assert.equal(first.pairedExperiments, 12);
  assert.equal(first.comparisons.random.avgUtility.verdict, "evidence-of-improvement");
  assert.equal(first.comparisons.llm.redundancyRate.verdict, "evidence-of-improvement");
});

test("analysis accepts persisted Prisma metrics JSON strings", () => {
  const rows = rowsFor("stored").map((row) => ({ ...row, metrics: JSON.stringify(row.metrics) }));
  const result = analyzePlannerExperiments(rows);
  assert.equal(result.pairedExperiments, 1);
});

test("insufficient independent experiments never produce confidence intervals", () => {
  const result = analyzePlannerExperiments(rowsFor("one"), { bootstrapSamples: 100 });
  assert.equal(result.pairedExperiments, 1);
  assert.equal(result.comparisons.single_shot.avgUtility.verdict, "insufficient-data");
  assert.equal(result.comparisons.single_shot.avgUtility.ci95, null);
});

test("incomplete, duplicate, and invalid experiment arms are excluded as paired units", () => {
  const rows = [
    ...rowsFor("good"),
    ...rowsFor("incomplete").filter((row) => row.arm !== "llm"),
    ...rowsFor("duplicate"),
    rowsFor("duplicate")[0],
    { ...rowsFor("invalid")[0], metrics: { avgUtility: 900 } },
  ];
  const result = analyzePlannerExperiments(rows);
  assert.equal(result.pairedExperiments, 1);
  assert.equal(result.excludedExperiments, 3);
});

test("negative-direction metrics are normalized so lower redundancy is better", () => {
  const rows = Array.from({ length: 10 }, (_, i) => rowsFor("r-" + i, 80, 70)).flat();
  const result = analyzePlannerExperiments(rows, { bootstrapSamples: 100 });
  assert.equal(result.comparisons.llm.redundancyRate.verdict, "evidence-of-improvement");
});
