import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const projectRoute = fs.readFileSync(new URL("src/app/api/projects/[id]/route.ts", root), "utf8");
const plannerRoute = fs.readFileSync(new URL("src/app/api/projects/[id]/planner/route.ts", root), "utf8");
const feedbackRoute = fs.readFileSync(new URL("src/app/api/projects/[id]/planner/feedback/route.ts", root), "utf8");
const agentRoute = fs.readFileSync(new URL("src/app/api/projects/[id]/agent-evaluation/route.ts", root), "utf8");
const proxy = fs.readFileSync(new URL("proxy.ts", root), "utf8");

test("general project DTO returns artifact metadata only, never hidden evaluation artifacts", () => {
  assert.match(projectRoute, /artifacts: \{ orderBy: \{ createdAt: "desc" \}, select: \{ id: true, stage: true, kind: true, createdAt: true \} \}/);
  assert.doesNotMatch(projectRoute, /artifacts: \{ orderBy: \{ createdAt: "desc" \} \}/);
});
test("unblinded planner experiment history is protected while reviewers receive only a completed experiment identifier", () => {
  assert.match(proxy, /if \(route === "planner"\)[\s\S]*?method === "GET" \|\| method === "HEAD" \? "requirements:approve"/);
  assert.match(feedbackRoute, /export async function GET/);
  assert.match(feedbackRoute, /return NextResponse\.json\(\{ experimentId, ready: Boolean\(experimentId\) \}/);
  assert.doesNotMatch(feedbackRoute.slice(feedbackRoute.indexOf("export async function GET"), feedbackRoute.indexOf("export async function POST")), /arm|questions|answerKey/);
});
test("generic agent evaluation never includes planner arm artifacts", () => {
  assert.match(agentRoute, /const AGENT_STAGES = \["ELICITATION", "SCOPE", "EXTRACTION"/);
  assert.doesNotMatch(agentRoute, /const AGENT_STAGES = \["PLANNER"/);
});
