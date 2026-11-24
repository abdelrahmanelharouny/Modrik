import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/app/api/projects/[id]/pipeline/route.ts", import.meta.url), "utf8");

test("approval revalidates and commits gate transition, journal and pipeline run in one transaction", () => {
  const start = source.indexOf("const finalization = await db.$transaction");
  const end = source.indexOf("if (!finalization.ok)", start);
  assert.ok(start >= 0, "approval finalization transaction must exist");
  assert.ok(end > start, "approval transaction must finish before response handling");
  const block = source.slice(start, end);
  assert.match(block, /validateApproval\(id, stage, tx as unknown as typeof db\)/);
  assert.match(block, /tx\.project\.updateMany\(/);
  assert.match(block, /tx\.decisionEntry\.create\(/);
  assert.match(block, /tx\.pipelineRun\.update\(/);
  assert.match(block, /transitioned\.count !== 1/);
});

test("agent completion commits review state, journal entry and run status atomically", () => {
  const start = source.indexOf("await db.$transaction(async (tx) => {", source.indexOf('if (action === "run")'));
  const end = source.indexOf("return NextResponse.json({ ok: true, stageStatus:", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /tx\.project\.updateMany\(/);
  assert.match(block, /tx\.decisionEntry\.create\(/);
  assert.match(block, /tx\.pipelineRun\.update\(/);
});

test("reopening a completed baseline and recording its decision are atomic", () => {
  const start = source.indexOf("const reopened = await db.$transaction");
  const end = source.indexOf("if (!reopened)", start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /tx\.project\.updateMany\(/);
  assert.match(block, /tx\.decisionEntry\.create\(/);
});
