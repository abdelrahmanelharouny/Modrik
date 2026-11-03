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
