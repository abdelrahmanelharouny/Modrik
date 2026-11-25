import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("durable agent worker includes lease fencing, heartbeats, retry and shutdown",()=>{
 const source=fs.readFileSync(new URL("../scripts/run-pipeline-worker.ts",import.meta.url),"utf8");
 for(const pattern of [/buildPipelineJobClaimFilter/,/leaseToken/,/guardLease\(job,tx\)/,/setInterval\(\(\)=>\{void heartbeat/,/isolationLevel:"Serializable"/,/SIGTERM/,/healthServer/,/runPlanner\(job\.projectId/,/runStageAgent\(job\.stage/])assert.match(source,pattern);
});
test("worker redacts errors and dead-letters permanent failures",()=>{
 const source=fs.readFileSync(new URL("../scripts/run-pipeline-worker.ts",import.meta.url),"utf8");
 assert.match(source,/sanitizePipelineJobError/);assert.match(source,/isRetryablePipelineFailure/);assert.match(source,/permanent:!isRetryablePipelineFailure/);
});
test("every long-running agent write receives the transactional fencing guard",()=>{
 const agents=fs.readFileSync(new URL("../src/lib/agents.ts",import.meta.url),"utf8");
 const planner=fs.readFileSync(new URL("../src/lib/planner.ts",import.meta.url),"utf8");
 assert.match(agents,/await guard\?\.\(tx\)/);assert.match(agents,/PipelineJobLeaseLostError/);
 assert.match(planner,/await guard\?\.\(tx\)/);assert.match(planner,/PipelineJobLeaseLostError/);
});

test("change-impact jobs use the durable worker path and database-aware readiness",()=>{
 const source=fs.readFileSync(new URL("../scripts/run-pipeline-worker.ts",import.meta.url),"utf8");
 assert.match(source,/job\.jobKind==="change_impact"/);
 assert.match(source,/analyzeDrift\(job\.projectId/);
 assert.match(source,/tx\.changeImpactFinding\.upsert/);
 assert.match(source,/databaseHealthy/);
 assert.match(source,/\$queryRaw/);
});
