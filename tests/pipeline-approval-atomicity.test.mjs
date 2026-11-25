import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../src/app/api/projects/[id]/pipeline/route.ts",import.meta.url),"utf8");
test("durable enqueue atomically claims the stage and creates one run plus one job",()=>{
 const start=source.indexOf("const enqueued = await db.$transaction");
 const end=source.indexOf("if (!enqueued)",start);
 assert.ok(start>=0&&end>start);
 const block=source.slice(start,end);
 assert.match(block,/tx\.project\.updateMany/);
 assert.match(block,/tx\.pipelineRun\.create/);
 assert.match(block,/tx\.agentJob\.create/);
 assert.match(block,/tx\.decisionEntry\.create/);
 assert.match(source,/status: 202/);
});
test("approval revalidates and atomically commits gate transition, journal and run",()=>{
 const start=source.indexOf("const finalization = await db.$transaction");
 const end=source.indexOf("if (!finalization.ok)",start);
 assert.ok(start>=0&&end>start);
 const block=source.slice(start,end);
 assert.match(block,/validateApproval\(id, stage, tx as unknown as typeof db\)/);
 assert.match(block,/tx\.project\.updateMany/);
 assert.match(block,/tx\.decisionEntry\.create/);
 assert.match(block,/tx\.pipelineRun\.update/);
 assert.match(block,/transitioned\.count !== 1/);
});
test("reopening a completed baseline and recording its decision are atomic",()=>{
 const start=source.indexOf("const reopened = await db.$transaction");
 const end=source.indexOf("if (!reopened)",start);
 assert.ok(start>=0&&end>start);
 const block=source.slice(start,end);
 assert.match(block,/tx\.project\.updateMany/);
 assert.match(block,/tx\.decisionEntry\.create/);
});
test("HTTP request no longer executes an LLM agent inline",()=>{
 assert.doesNotMatch(source,/await runStageAgent\(/);
 assert.doesNotMatch(source,/await runPlanner\(/);
 assert.match(source,/tx\.agentJob\.create/);
});
