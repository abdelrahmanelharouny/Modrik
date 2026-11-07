import test from "node:test";
import assert from "node:assert/strict";
import { analyzePlannerBenchmark, renderPlannerBenchmarkMarkdown, validatePlannerBenchmarkRecords } from "../src/lib/benchmark/planner-analysis.mjs";
function record(id,impact,baseline){const metrics=o=>({avgUtility:70+o,utilityPerCost:12+o,evidenceCoverage:80+o,redundancyRate:20-o,dialectFit:85+o}),hash="a".repeat(64);return{status:"success",scenarioId:id,seed:"seed-"+id,category:"dialect_ar_eg",difficulty:"hard",candidateCount:12,arms:[{arm:"single_shot",metrics:metrics(baseline),estTokens:900,latencyMs:4000,candidatePoolHash:null},{arm:"random",metrics:metrics(baseline+1),estTokens:1200,latencyMs:5000,candidatePoolHash:hash},{arm:"llm",metrics:metrics(baseline+2),estTokens:1300,latencyMs:6000,candidatePoolHash:hash},{arm:"impact_aware",metrics:metrics(impact),estTokens:1250,latencyMs:5500,candidatePoolHash:hash}]};}
test("benchmark validation requires four arms and one shared pool hash",()=>{assert.deepEqual(validatePlannerBenchmarkRecords([record("s1",5,0)]),[]);const invalid=[record("s2",5,0)];invalid[0].arms[2].candidatePoolHash="b".repeat(64);assert.ok(validatePlannerBenchmarkRecords(invalid).some(e=>e.includes("candidate-pool hash")));assert.throws(()=>analyzePlannerBenchmark(invalid),/Invalid planner benchmark data/);});
test("paired analysis is deterministic, direction-aware and Holm-adjusted",()=>{const data=Array.from({length:12},(_,i)=>record("s"+i,6,0)),a=analyzePlannerBenchmark(data,{seed:"fixed"}),b=analyzePlannerBenchmark(data,{seed:"fixed"});assert.deepEqual(a,b);const coverage=a.comparisons.find(x=>x.metric==="evidenceCoverage"&&x.comparator==="single_shot"),redundancy=a.comparisons.find(x=>x.metric==="redundancyRate"&&x.comparator==="single_shot");assert.ok(coverage.meanPairedImprovement>0);assert.ok(redundancy.meanPairedImprovement>0);assert.ok(coverage.pAdjustedHolm>=coverage.pValue);assert.equal(a.scenarioCount,12);});
test("markdown report states planner-only scope and judge limitations",()=>{const markdown=renderPlannerBenchmarkMarkdown(analyzePlannerBenchmark([record("s1",6,0)]));assert.match(markdown,/arbench-v2 Planner Ablation Report/);assert.match(markdown,/not a 120-scenario evaluation/);assert.match(markdown,/LLM-as-judge metrics are exploratory/);});

test("one to nine paired scenarios remain descriptive without inferential claims", () => {
  const report = analyzePlannerBenchmark([record("small", 6, 0)]);
  const comparison = report.comparisons.find((item) => item.metric === "avgUtility" && item.comparator === "single_shot");
  assert.equal(comparison.verdict, "insufficient-data");
  assert.equal(comparison.ci95, null);
  assert.equal(comparison.pValue, null);
});
