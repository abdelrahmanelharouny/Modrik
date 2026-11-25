import test from "node:test";
import assert from "node:assert/strict";
import { buildPipelineJobClaimFilter, buildPipelineJobHeartbeatData, buildPipelineJobLease, buildPipelineJobOwnershipFilter, buildPipelineJobRetry, isRetryablePipelineFailure, sanitizePipelineJobError, PipelineJobLeaseLostError } from "../src/lib/pipeline/job-queue.mjs";
test("queue claim filter includes queued, delayed retries and expired leases",()=>{
 const now=new Date("2026-11-25T00:00:00.000Z");
 assert.deepEqual(buildPipelineJobClaimFilter(now),{OR:[
  {status:"queued",availableAt:{lte:now}},
  {status:"retry_wait",availableAt:{lte:now}},
  {status:"running",leaseExpiresAt:{lte:now}},
 ]});
});
test("lease tokens fence owners and heartbeat extends a lease",()=>{
 const now=new Date("2026-11-25T00:00:00.000Z");
 const lease=buildPipelineJobLease({workerId:"worker-a",leaseToken:"fence-a",now,leaseMs:90_000});
 assert.equal(lease.leaseExpiresAt.getTime()-now.getTime(),90_000);
 assert.deepEqual(buildPipelineJobOwnershipFilter({jobId:"j1",workerId:"worker-a",leaseToken:"fence-a"}),{id:"j1",status:"running",lockedBy:"worker-a",leaseToken:"fence-a"});
 assert.equal(buildPipelineJobHeartbeatData({now,leaseMs:120_000}).leaseExpiresAt.getTime(),now.getTime()+120_000);
});
test("retries use bounded exponential delay and eventually dead-letter",()=>{
 const now=new Date("2026-11-25T00:00:00.000Z");
 const retry=buildPipelineJobRetry({attempts:3,maxAttempts:5,baseDelayMs:2000,now,error:"timeout"});
 assert.equal(retry.status,"retry_wait");assert.equal(retry.delayMs,8000);
 assert.equal(retry.availableAt.getTime(),now.getTime()+8000);
 const dead=buildPipelineJobRetry({attempts:5,maxAttempts:5,now,error:"timeout"});
 assert.equal(dead.status,"dead");assert.ok(dead.completedAt instanceof Date);
});
test("permanent provider configuration failures stop retry and secrets are redacted",()=>{
 assert.equal(isRetryablePipelineFailure(new Error("HTTP 401 Unauthorized")),false);
 assert.equal(isRetryablePipelineFailure(new Error("provider timeout")),true);
 const safe=sanitizePipelineJobError("Bearer abc123 api_key=secret123 https://x.test?a=1&access_token=token123");
 assert.doesNotMatch(safe,/abc123|secret123|token123/);
 assert.equal(new PipelineJobLeaseLostError().code,"PIPELINE_JOB_LEASE_LOST");
});
