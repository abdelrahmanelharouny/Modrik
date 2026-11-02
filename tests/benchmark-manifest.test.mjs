import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBenchmark } from "../scripts/validate-benchmark.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "bench", "manifest.json"), "utf8"));
const readScenario = (id) => JSON.parse(fs.readFileSync(path.join(root, "bench", "scenarios", `${id}.json`), "utf8"));

test("arbench-v2 contains 120 unique, structurally valid, manifest-matched scenarios", () => {
  const result = validateBenchmark(manifest, readScenario);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    name: "arbench-v2",
    scenarioCount: 120,
    categories: 8,
    domains: 5,
    uniqueIds: 120,
  });
});

test("benchmark validation rejects duplicate IDs and missing scenario files", () => {
  const duplicateManifest = {
    ...manifest,
    scenarios: [manifest.scenarios[0], manifest.scenarios[0]],
    scenario_count: 2,
  };
  const result = validateBenchmark(duplicateManifest, () => {
    throw new Error("fixture file missing");
  });
  assert.ok(result.errors.some((error) => error.includes("duplicate scenario id")));
  assert.ok(result.errors.some((error) => error.includes("scenario file missing")));
  assert.ok(result.errors.some((error) => error.includes("exactly 120")));
});
