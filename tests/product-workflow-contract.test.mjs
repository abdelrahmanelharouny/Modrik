import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [domain, workspace, pipeline, debrief] = await Promise.all([
  readFile(new URL("../src/lib/rp.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/rp/workspace.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/projects/[id]/pipeline/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/rp/stage-complete.tsx", import.meta.url), "utf8"),
]);

const expectedStages = [
  "ELICITATION",
  "PROBLEM_SELECTION",
  "EXTRACTION",
  "AMBIGUITY",
  "STORIES",
  "CONFLICTS",
];

test("product domain exposes the six canonical workflow stages in order", () => {
  const match = domain.match(/export const STAGES = \[([\s\S]*?)\] as const/);
  assert.ok(match, "STAGES must remain an explicit canonical list");
  const actual = [...match[1].matchAll(/"([A-Z_]+)"/g)].map((item) => item[1]);
  assert.deepEqual(actual, expectedStages);
});

test("workspace renders one reviewable cockpit for every canonical stage plus Debrief", () => {
  const components = {
    ELICITATION: "ElicitationStage",
    PROBLEM_SELECTION: "ProblemsStage",
    EXTRACTION: "ExtractionStage",
    AMBIGUITY: "AmbiguityStage",
    STORIES: "StoriesStage",
    CONFLICTS: "ConflictsStage",
  };

  for (const [stage, component] of Object.entries(components)) {
    assert.match(workspace, new RegExp(`viewing === "${stage}" && <${component}\\b`),
      `${stage} must be wired to ${component}`);
    assert.match(workspace, new RegExp(`import \\{ ${component} \} from "@\/components\/rp\/`),
      `${component} must be imported by the workspace`);
  }

  assert.match(workspace, /const VIEW_ORDER: \(Stage \| "DEBRIEF"\)\[\] = \[\.\.\.STAGES, "DEBRIEF"\]/);
  assert.match(workspace, /<DebriefBay project=\{project\} refresh=\{refresh\} \/>/);
  assert.match(debrief, /export function DebriefBay\b/);
});

test("pipeline API retains explicit run, approve and reopen actions with compare-and-swap ownership", () => {
  assert.match(pipeline, /\["run", "approve", "reopen"\]/);
  assert.match(pipeline, /const expectedStatus = action === "run" \? "awaiting_input" : "awaiting_review"/);
  assert.match(pipeline, /const claimedStatus = action === "run" \? "agent_running" : "approving"/);
  assert.match(pipeline, /await db\.project\.updateMany\(/);
  assert.match(pipeline, /if \(claim\.count !== 1\)/);
  assert.match(pipeline, /validateElicitationApproval/);
  assert.match(pipeline, /validateRequirementApproval/);
  assert.match(pipeline, /validateStoryApproval/);
  assert.match(pipeline, /validateConflictApproval/);
  assert.match(pipeline, /Only a completed baseline can be reopened/);
});

test("workspace exposes human-gated controls rather than auto-advancing after an agent run", () => {
  assert.match(workspace, /body: JSON\.stringify\(\{ action: "run"/);
  assert.match(workspace, /body: JSON\.stringify\(\{ action: "approve" \}\)/);
  assert.match(workspace, /await refresh\(\)/);
  assert.match(workspace, /Approve & continue/);
  assert.match(workspace, /awaiting_review/);
});
