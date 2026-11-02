import test from "node:test";
import assert from "node:assert/strict";
import {loadPlannerFixtures} from "../scripts/validate-planner-benchmark.mjs";
test("planner fixture subset is balanced and all gold/evidence payloads are valid",()=>{const r=loadPlannerFixtures();assert.deepEqual(r.errors,[]);assert.equal(r.summary.totalCorpus,120);assert.equal(r.summary.plannerScenarios,30);assert.deepEqual(r.summary.categories,{elicitation:15,dialect_ar_eg:15});assert.equal(r.scenarios.length,30);});
