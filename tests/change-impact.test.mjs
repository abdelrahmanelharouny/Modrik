import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeChangeImpactInput, resolveChangeImpactTriage, changeImpactFindingIsActive } from "../src/lib/pipeline/change-impact.mjs";

test("change-impact queue input is bounded and source-attributed",()=>{
  const input=normalizeChangeImpactInput({projectId:"project-1",source:"github",idempotencyKey:"github-webhook:hash",signal:"API contract changed",externalKey:"delivery-1",title:"Issue 42"});
  assert.equal(input.source,"github");assert.equal(input.externalKey,"delivery-1");
  assert.throws(()=>normalizeChangeImpactInput({projectId:"p",source:"github",idempotencyKey:"k",signal:""}),/signal/);
  assert.throws(()=>normalizeChangeImpactInput({projectId:"p",source:"unknown",idempotencyKey:"k",signal:"x"}),/source/);
  assert.throws(()=>normalizeChangeImpactInput({projectId:"p",source:"jira",idempotencyKey:"k",signal:"x".repeat(2001)}),/2000/);
});
test("impact findings require explicit human triage and reject stale transitions",()=>{
  assert.deepEqual(resolveChangeImpactTriage("pending","confirm"),{action:"confirm",from:"pending",to:"confirmed"});
  assert.deepEqual(resolveChangeImpactTriage("confirmed","dismiss"),{action:"dismiss",from:"confirmed",to:"dismissed"});
  assert.equal(resolveChangeImpactTriage("dismissed","confirm"),null);
  assert.equal(changeImpactFindingIsActive("pending"),true);
  assert.equal(changeImpactFindingIsActive("confirmed"),true);
  assert.equal(changeImpactFindingIsActive("resolved"),false);
});

test("provider webhooks acknowledge durable enqueue instead of awaiting the LLM",()=>{
  for(const path of ["../src/app/api/webhooks/github/[projectId]/route.ts","../src/app/api/webhooks/jira/[projectId]/route.ts"]){
    const source=fs.readFileSync(new URL(path,import.meta.url),"utf8");
    assert.match(source,/enqueueChangeImpactJob/);
    assert.match(source,/status:\s*202/);
    assert.match(source,/idempotencyKey/);
    assert.doesNotMatch(source,/runDrift\(/);
  }
});
