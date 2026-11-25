import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [domain,workspace,pipeline,debrief]=await Promise.all([
 readFile(new URL("../src/lib/rp.ts",import.meta.url),"utf8"),
 readFile(new URL("../src/components/rp/workspace.tsx",import.meta.url),"utf8"),
 readFile(new URL("../src/app/api/projects/[id]/pipeline/route.ts",import.meta.url),"utf8"),
 readFile(new URL("../src/components/rp/stage-complete.tsx",import.meta.url),"utf8"),
]);
const expectedStages=["ELICITATION","PROBLEM_SELECTION","EXTRACTION","AMBIGUITY","STORIES","CONFLICTS"];
test("six canonical workflow stages remain ordered",()=>{
 const match=domain.match(/export const STAGES = \[([\s\S]*?)\] as const/);
 assert.ok(match);assert.deepEqual([...match[1].matchAll(/"([A-Z_]+)"/g)].map(x=>x[1]),expectedStages);
});
test("workspace renders every stage and the debrief",()=>{
 const components={ELICITATION:"ElicitationStage",PROBLEM_SELECTION:"ProblemsStage",EXTRACTION:"ExtractionStage",AMBIGUITY:"AmbiguityStage",STORIES:"StoriesStage",CONFLICTS:"ConflictsStage"};
 for(const [stage,component] of Object.entries(components)){
  const needle=stage==="CONFLICTS"?'viewing === "CONFLICTS" && <>':`viewing === "${stage}" && <${component}`;
  assert.ok(workspace.includes(needle),stage);assert.ok(workspace.includes(`import { ${component} }`),component);
 }
 assert.match(workspace,/const VIEW_ORDER: \(Stage \| "DEBRIEF"\)\[\] = \[\.\.\.STAGES, "DEBRIEF"\]/);
 assert.match(workspace,/<DebriefBay project=\{project\} refresh=\{refresh\} \/>/);
 assert.match(debrief,/export function DebriefBay\b/);
});
test("pipeline route keeps run, approve and reopen actions while making agent execution durable",()=>{
 assert.match(pipeline,/\["run", "approve", "reopen"\]/);
 assert.match(pipeline,/const expectedStatus = action === "run" \? "awaiting_input" : "awaiting_review"/);
 assert.match(pipeline,/const claimedStatus = action === "run" \? "agent_running" : "approving"/);
 assert.match(pipeline,/tx\.project\.updateMany/);
 assert.match(pipeline,/tx\.agentJob\.create/);
 assert.match(pipeline,/status: 202/);
 assert.match(pipeline,/Only a completed baseline can be reopened/);
 assert.doesNotMatch(pipeline,/await runStageAgent\(/);
});
test("workspace queues a job and still requires the explicit human approval gate",()=>{
 assert.match(workspace,/body: JSON\.stringify\(\{ action: "run"/);
 assert.match(workspace,/body: JSON\.stringify\(\{ action: "approve" \}\)/);
 assert.match(workspace,/Agent queued/);
 assert.match(workspace,/Agent running in background/);
 assert.match(workspace,/Approve & continue/);
 assert.match(workspace,/awaiting_review/);
});
