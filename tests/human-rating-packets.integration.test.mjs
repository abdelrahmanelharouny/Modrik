import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, verifyHumanRatingArtifacts } from "../src/lib/research/human-ratings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "create-human-rating-packets.mjs");
const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const mode = async (file) => (await stat(file)).mode & 0o777;

test("human-rating packet CLI generates private, blinded, hash-bound artifacts from real planner fixtures", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "modrik-human-rating-cli-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(path.join(ROOT, "bench", "manifest.json"), "utf8"));
  const entries = manifest.scenarios.filter((entry) => entry.gold_type === "question_utility_json").slice(0, 10);
  assert.equal(entries.length, 10, "the smoke test needs ten real planner fixtures");

  const records = [];
  for (const entry of entries) {
    const scenario = JSON.parse(await readFile(path.join(ROOT, "bench", "scenarios", entry.id + ".json"), "utf8"));
    assert.ok(scenario.evidence.some((item) => item.consent === true), entry.id + " must contain explicitly consented evidence");
    records.push({
      status: "success",
      scenarioId: entry.id,
      category: scenario.category,
      difficulty: scenario.difficulty,
      candidateCount: 5,
      estTokens: 120,
      latencyMs: 80,
      arms: ["single_shot", "random", "llm", "impact_aware"].map((arm) => ({
        arm,
        candidatePoolHash: arm === "single_shot" ? undefined : "fixture-pool-hash",
        metrics: {},
        questions: [{
          text: "Fixture question for " + arm,
          language: "en",
          rationale: "PRIVATE_RATIONALE_SENTINEL",
          priority: "PRIVATE_PRIORITY_SENTINEL",
          askCost: "PRIVATE_ASK_COST_SENTINEL",
          fallbackAssumption: "PRIVATE_FALLBACK_SENTINEL",
          utility: "PRIVATE_UTILITY_SENTINEL",
        }],
      })),
    });
  }

  const input = path.join(temp, "planner-runs.jsonl");
  const out = path.join(temp, "generated");
  await writeFile(input, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  const run = () => execFileSync(process.execPath, [SCRIPT, "--input", input, "--out", out, "--seed", "cli-smoke-seed", "--min-scenarios", "10"], { cwd: ROOT, encoding: "utf8" });
  const stdout = run();
  assert.match(stdout, /Created two blind rating packets for 10 scenarios/);

  const r1Path = path.join(out, "rater-1", "packet.csv");
  const r2Path = path.join(out, "rater-2", "packet.csv");
  const coordinator = path.join(out, "coordinator-only");
  const r1Text = await readFile(r1Path, "utf8");
  const r2Text = await readFile(r2Path, "utf8");
  const packetText = await readFile(path.join(coordinator, "canonical-packet.json"), "utf8");
  const keyText = await readFile(path.join(coordinator, "answer-key.csv"), "utf8");
  const manifestText = await readFile(path.join(coordinator, "manifest.json"), "utf8");
  const generatedManifest = JSON.parse(manifestText);

  assert.equal(generatedManifest.scenarioCount, 10);
  assert.equal(generatedManifest.outputsPerRater, 40);
  assert.equal(generatedManifest.raterFiles[0], "../rater-1/packet.csv");
  assert.equal(generatedManifest.raterFiles[1], "../rater-2/packet.csv");
  assert.equal(verifyHumanRatingArtifacts({
    canonicalPacketText: packetText,
    rater1CsvText: r1Text,
    rater2CsvText: r2Text,
    answerKeyCsvText: keyText,
    manifest: generatedManifest,
  }), true);

  const r1Rows = parseCsv(r1Text);
  const r2Rows = parseCsv(r2Text);
  const keyRows = parseCsv(keyText);
  assert.equal(r1Rows.length, 40);
  assert.equal(r2Rows.length, 40);
  assert.equal(keyRows.length, 40);
  assert.ok(r1Rows.every((row) => row.rater_code === "R1" && !("arm" in row)));
  assert.ok(r2Rows.every((row) => row.rater_code === "R2" && !("arm" in row)));
  assert.ok(keyRows.every((row) => ["single_shot", "random", "llm", "impact_aware"].includes(row.arm)));
  for (const sentinel of ["PRIVATE_RATIONALE_SENTINEL", "PRIVATE_PRIORITY_SENTINEL", "PRIVATE_ASK_COST_SENTINEL", "PRIVATE_FALLBACK_SENTINEL", "PRIVATE_UTILITY_SENTINEL"]) {
    assert.equal(r1Text.includes(sentinel), false, sentinel + " leaked into rater 1 export");
    assert.equal(r2Text.includes(sentinel), false, sentinel + " leaked into rater 2 export");
    assert.equal(packetText.includes(sentinel), false, sentinel + " leaked into canonical packet");
  }
  assert.equal(await mode(path.join(out, "rater-1")), 0o700);
  assert.equal(await mode(path.join(out, "rater-2")), 0o700);
  assert.equal(await mode(coordinator), 0o700);
  for (const file of [r1Path, r2Path, path.join(coordinator, "answer-key.csv"), path.join(coordinator, "canonical-packet.json"), path.join(coordinator, "manifest.json")]) {
    assert.equal(await mode(file), 0o600, file + " must be owner-only");
  }

  const before = await Promise.all([r1Path, r2Path, path.join(coordinator, "manifest.json")].map((file) => readFile(file, "utf8")));
  assert.throws(run, /EEXIST|already exists|Packet creation aborted/);
  const after = await Promise.all([r1Path, r2Path, path.join(coordinator, "manifest.json")].map((file) => readFile(file, "utf8")));
  assert.deepEqual(after, before, "a second run must not overwrite previously generated artifacts");
  assert.deepEqual((await readdir(coordinator)).sort(), ["answer-key.csv", "canonical-packet.json", "manifest.json"]);
});
