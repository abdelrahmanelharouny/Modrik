import test from "node:test";
import assert from "node:assert/strict";
import { summarizeChangeCostCalibration } from "../src/lib/change-cost-calibration.mjs";

test("empty calibration is explicit and has no fit or predictive metrics",()=>{
  const result=summarizeChangeCostCalibration([]);
  assert.equal(result.sampleCount,0);assert.equal(result.trainingSampleCount,0);assert.equal(result.holdoutSampleCount,0);
  assert.equal(result.modelVersion,"change-cost-v3-temporal");assert.equal(result.fit,null);assert.equal(result.maeHours,null);
  assert.equal(result.protocol,"temporal_holdout_v1");assert.equal(result.readiness,"no_observations");
});
test("small samples remain descriptive and do not fabricate holdout metrics",()=>{
  const rows=[1,2,3,4].map((points)=>({estimate:{effortPoints:points},outcome:{actualHours:2+3*points,recordedAt:new Date(2026,0,points).toISOString(),changeType:"feature"}}));
  const result=summarizeChangeCostCalibration(rows);
  assert.equal(result.sampleCount,4);assert.equal(result.trainingSampleCount,4);assert.equal(result.holdoutSampleCount,0);
  assert.deepEqual(result.fit,{intercept:2,hoursPerEffortPoint:3});assert.equal(result.maeHours,null);
  assert.match(result.caveat,/Insufficient observations/);
});
test("temporal holdout is the newest fifth and is excluded from fit training",()=>{
  const rows=Array.from({length:10},(_,index)=>({
    estimate:{effortPoints:index+1},
    outcome:{actualHours:index<8?2+3*(index+1):100,recordedAt:new Date(Date.UTC(2026,0,index+1)).toISOString(),changeType:index<8?"feature":"bugfix"},
  }));
  const result=summarizeChangeCostCalibration(rows);
  assert.equal(result.trainingSampleCount,8);assert.equal(result.holdoutSampleCount,2);
  assert.deepEqual(result.fit,{intercept:2,hoursPerEffortPoint:3});
  assert.equal(result.maeHours,68);assert.equal(result.readiness,"early_signal");
  assert.equal(result.segments.find((s)=>s.changeType==="bugfix").sampleCount,2);
});
test("latest timestamp determines holdout ordering, independent of input ordering",()=>{
  const rows=Array.from({length:10},(_,index)=>({
    estimate:{effortPoints:index+1},outcome:{actualHours:index+2,recordedAt:new Date(Date.UTC(2026,0,index+1)).toISOString()},
  }));
  const forward=summarizeChangeCostCalibration(rows),reverse=summarizeChangeCostCalibration([...rows].reverse());
  assert.deepEqual(forward.fit,reverse.fit);assert.equal(forward.holdoutSampleCount,reverse.holdoutSampleCount);
  assert.equal(forward.maeHours,reverse.maeHours);
});
test("constant estimates do not invent a fitted slope",()=>{
  const rows=[1,2,3,4,5,6,7,8,9,10].map((_,i)=>({estimate:{effortPoints:2},outcome:{actualHours:i+1,recordedAt:new Date(Date.UTC(2026,0,i+1)).toISOString()}}));
  const result=summarizeChangeCostCalibration(rows);assert.equal(result.fit,null);assert.equal(result.maeHours,null);
});
test("readiness thresholds are deterministic and are not accuracy guarantees",()=>{
  const rows=Array.from({length:30},(_,index)=>({estimate:{effortPoints:index+1},outcome:{actualHours:(index+1)*1.5,recordedAt:new Date(Date.UTC(2026,0,index+1)).toISOString()}}));
  assert.equal(summarizeChangeCostCalibration(rows.slice(0,9)).readiness,"collecting");
  assert.equal(summarizeChangeCostCalibration(rows.slice(0,10)).readiness,"early_signal");
  assert.equal(summarizeChangeCostCalibration(rows).readiness,"review_candidate");
});
