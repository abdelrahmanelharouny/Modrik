import test from "node:test";
import assert from "node:assert/strict";
import { hashRequirementSnapshot, normalizeQualityAssessment, isQualityAssessmentCurrent, QUALITY_DIMENSIONS } from "../src/lib/requirements/quality.mjs";

const requirement={text:"The portal shall support Arabic.",type:"functional",priority:"Must",language:"en"};
const scores=Object.fromEntries(QUALITY_DIMENSIONS.map(key=>[key,80]));
test("quality assessment computes a deterministic average and preserves source snapshot",()=>{
 const result=normalizeQualityAssessment({...scores,issues:["Missing measurable response time"]},requirement);
 assert.equal(result.overallScore,80);
 assert.equal(result.sourceText,requirement.text);
 assert.equal(result.sourceHash,hashRequirementSnapshot(requirement));
 assert.deepEqual(JSON.parse(result.issues),["Missing measurable response time"]);
});
test("every quality dimension is required and bounded to integer 0..100",()=>{
 assert.throws(()=>normalizeQualityAssessment({...scores,clarity:101},requirement),/clarity/);
 assert.throws(()=>normalizeQualityAssessment({...scores,clarity:50.5},requirement),/clarity/);
 const incomplete={...scores};delete incomplete.atomicity;
 assert.throws(()=>normalizeQualityAssessment(incomplete,requirement),/atomicity/);
});
test("assessment snapshot becomes stale when requirement text or metadata changes",()=>{
 const assessment=normalizeQualityAssessment(scores,requirement);
 assert.equal(isQualityAssessmentCurrent(assessment,requirement),true);
 assert.equal(isQualityAssessmentCurrent(assessment,{...requirement,text:"The portal shall support Arabic and English."}),false);
 assert.equal(isQualityAssessmentCurrent(assessment,{...requirement,priority:"Could"}),false);
});
test("issue and note payloads are bounded",()=>{
 assert.throws(()=>normalizeQualityAssessment({...scores,issues:Array(21).fill("issue")},requirement),/20/);
 assert.throws(()=>normalizeQualityAssessment({...scores,assessmentNote:"x".repeat(1001)},requirement),/length/);
});