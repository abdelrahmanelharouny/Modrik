import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = fs.readFileSync(new URL("../scripts/run-continuous-drift-sweep.ts", import.meta.url), "utf8");
const workflow = fs.readFileSync(new URL("../.github/workflows/continuous-drift-detection.yml", import.meta.url), "utf8");
test("continuous drift only queues explicitly consented evidence revisions with approved requirements", () => {
  assert.match(source, /where: \{ createdAt: \{ gte: since \}, consent: true \}/);
  assert.match(source, /reqs: \{ where: \{ status: "approved" \}/);
  assert.match(source, /source: "scheduled"/);
  assert.match(source, /scheduled-drift:evidence-revision:/);
  assert.match(source, /never edit or approve requirements/i);
});
test("continuous drift workflow is scheduled hourly and fails safe without DB configuration", () => {
  assert.match(workflow, /cron: "23 \* \* \* \*"/);
  assert.match(workflow, /if \[ -z "\$DATABASE_URL" \]/);
  assert.match(workflow, /bun scripts\/run-continuous-drift-sweep\.ts/);
});
