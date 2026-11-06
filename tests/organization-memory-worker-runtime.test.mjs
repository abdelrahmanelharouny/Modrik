import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("worker strips helper-only retry metadata and asserts lease ownership", () => {
  const source = fs.readFileSync(new URL("../scripts/run-organization-memory-embedding-worker.mjs", import.meta.url), "utf8");
  assert.match(source, /delayMs: _delayMs, \.\.\.retryData/);
  assert.match(source, /result\.count !== 1/);
  assert.match(source, /lease ownership was lost before completion/);
});