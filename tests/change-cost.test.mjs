import test from "node:test";
import assert from "node:assert/strict";
import { estimateChangeCost } from "../src/lib/change-cost.mjs";
const req = (id, overrides = {}) => ({ id, refId: "REQ-" + id, priority: "Could", ambiguity: 10, driftStatus: "none", verifyStatus: "supported", ...overrides });

test("change-cost estimate is deterministic and separates direct from transitive impact", () => {
 const root=req("root",{priority:"Must"}), requirements=[root,req("a"),req("b")];
 const impacted=[{id:"a",depth:1,via:[{kind:"depends_on"}]},{id:"b",depth:2,via:[{kind:"depends_on"},{kind:"refines"}]}];
 const first=estimateChangeCost(root,impacted,requirements);
 assert.deepEqual(first,estimateChangeCost(root,impacted,requirements));
 assert.equal(first.affectedRequirements,2); assert.equal(first.directImpact,1); assert.equal(first.transitiveImpact,1);
 assert.ok(first.effortPoints>0); assert.ok(first.effortRange.low<first.effortPoints); assert.ok(first.effortRange.high>first.effortPoints);
});

test("risk modifiers surface high-priority, ambiguous, drifting and unverified requirements", () => {
 const root=req("root"), highRisk=req("risk",{priority:"Must",ambiguity:90,driftStatus:"changed",verifyStatus:"weak"});
 const estimate=estimateChangeCost(root,[{id:"risk",depth:1,via:[{kind:"conflicts_with"}]}],[root,highRisk]);
 assert.equal(estimate.highRiskRequirements,1);
 assert.deepEqual(estimate.factors.map(f=>f.id).sort(),["active_drift","high_ambiguity","must_priority","verification_open"]);
});

test("duplicate, root-self and unknown impact nodes do not inflate the estimate", () => {
 const root=req("root"), child=req("child");
 const estimate=estimateChangeCost(root,[{id:"root",depth:1},{id:"child",depth:1},{id:"child",depth:3},{id:"missing",depth:1}],[root,child]);
 assert.equal(estimate.affectedRequirements,1); assert.equal(estimate.directImpact,1); assert.equal(estimate.transitiveImpact,0);
});

test("invalid input is rejected instead of silently producing a score", () => {
 assert.throws(()=>estimateChangeCost(null,[],[]),/root requirement/);
 assert.throws(()=>estimateChangeCost(req("root"),{},[]),/collections must be arrays/);
});

test("change-cost v2 explains each requirement contribution and separates exposure from risk uplift", () => {
 const root=req("root",{priority:"Must",ambiguity:80});
 const child=req("child",{priority:"Should",ambiguity:50,driftStatus:"changed",verifyStatus:"weak"});
 const estimate=estimateChangeCost(root,[{id:"child",depth:1,via:[{kind:"conflicts_with"}]}],[root,child]);
 assert.equal(estimate.breakdown.length,2);
 const childRow=estimate.breakdown.find((row)=>row.requirementId==="child");
 assert.equal(childRow.depthWeight,1);
 assert.equal(childRow.relationWeight,1.35);
 assert.ok(childRow.riskMultiplier>1);
 assert.ok(childRow.riskUplift>0);
 assert.ok(childRow.effortPoints>childRow.baseExposure);
 assert.equal(estimate.uncertainty.percent,0);
 assert.equal(estimate.uncertainty.totalSignals,10);
});

test("change-cost uncertainty counts missing input signals, not the number of explanatory reasons", () => {
 const root=req("root");
 const complete=estimateChangeCost(root,[{id:"child",depth:1,via:[{kind:"depends_on"}]}],[root,req("child")]);
 const sparse={id:"sparse",refId:"REQ-sparse"};
 const sparseEstimate=estimateChangeCost(sparse,[{id:"child",depth:1,via:[{kind:"unknown-a"},{kind:"unknown-b"}]}],[sparse,{id:"child"}]);
 assert.equal(complete.uncertainty.percent,0);
 assert.equal(complete.uncertainty.totalSignals,10);
 assert.equal(sparseEstimate.uncertainty.missingSignals,9);
 assert.equal(sparseEstimate.uncertainty.totalSignals,10);
 assert.equal(sparseEstimate.uncertainty.percent,90);
 assert.equal(sparseEstimate.uncertainty.bandPercent,47);
 assert.ok(sparseEstimate.effortRange.high>sparseEstimate.effortPoints);
});

test("change-cost reports extrapolated graph weights and unknown relationship types", () => {
 const root=req("root"), child=req("child");
 const estimate=estimateChangeCost(root,[{id:"child",depth:6,via:[{kind:"untyped_edge"}]}],[root,child]);
 const row=estimate.breakdown.find((item)=>item.requirementId==="child");
 assert.ok(row.uncertaintyReasons.includes("depth_weight_extrapolated"));
 assert.ok(row.uncertaintyReasons.includes("relation_weight_defaulted"));
 assert.ok(estimate.uncertainty.factors.some((factor)=>factor.id==="relation_weight_defaulted"));
 assert.equal(estimate.uncertainty.missingSignals,2);
});

test("missing relationship provenance is visible and counted once", () => {
 const root=req("root"), child=req("child");
 const estimate=estimateChangeCost(root,[{id:"child",depth:1,via:[]}],[root,child]);
 const row=estimate.breakdown.find((item)=>item.requirementId==="child");
 assert.ok(row.uncertaintyReasons.includes("relation_weight_missing"));
 assert.equal(estimate.uncertainty.missingSignals,1);
 assert.equal(estimate.uncertainty.totalSignals,10);
});
