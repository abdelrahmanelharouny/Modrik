import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, verifyHumanRatingArtifacts, RATING_FIELDS, RATER_COLUMNS, serializeCsv } from "../src/lib/research/human-ratings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "create-human-rating-packets.mjs");
const ANALYZE_SCRIPT = path.join(ROOT, "scripts", "analyze-human-ratings.mjs");
const mode = async (file) => (await stat(file)).mode & 0o777;

test("human-rating packet CLI generates private, blinded, hash-bound artifacts from real planner fixtures", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "modrik-human-rating-cli-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(path.join(ROOT, "bench", "manifest.json"), "utf8"));
  const plannerEntries = manifest.scenarios.filter((entry) => entry.gold_type === "question_utility_json");
  const entries = [];
  for (const entry of plannerEntries) {
    const scenario = JSON.parse(await readFile(path.join(ROOT, "bench", "scenarios", entry.id + ".json"), "utf8"));
    if (scenario.evidence.some((item) => item.consent === true)) entries.push({ entry, scenario });
    if (entries.length === 10) break;
  }
  assert.equal(entries.length, 10, "the smoke test needs ten real planner fixtures with explicitly consented evidence");

  const records = [];
  for (const { entry, scenario } of entries) {
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

  const armByBlindId = new Map(keyRows.map((row) => [row.blind_output_id, row.arm]));
  const submitRatings = (rows) => rows.map((row) => {
    const score = armByBlindId.get(row.blind_output_id) === "impact_aware" ? "5" : "3";
    return {
      ...row,
      ...Object.fromEntries(RATING_FIELDS.map((field) => [field + "_1_5", field === "confidence" ? "4" : score])),
      notes: "Synthetic CLI integration rating",
    };
  });
  const ratedR1Path = path.join(temp, "rater-1-submission.csv");
  const ratedR2Path = path.join(temp, "rater-2-submission.csv");
  await writeFile(ratedR1Path, serializeCsv(submitRatings(r1Rows), RATER_COLUMNS), "utf8");
  await writeFile(ratedR2Path, serializeCsv(submitRatings(r2Rows), RATER_COLUMNS), "utf8");
  const manifestPath = path.join(coordinator, "manifest.json");
  const analysisOut = path.join(temp, "analysis");
  const analyze = (rater1 = ratedR1Path) => execFileSync(process.execPath, [
    ANALYZE_SCRIPT,
    "--rater1", rater1,
    "--rater2", ratedR2Path,
    "--key", path.join(coordinator, "answer-key.csv"),
    "--manifest", manifestPath,
    "--out", analysisOut,
    "--seed", "cli-analysis-smoke-seed",
  ], { cwd: ROOT, encoding: "utf8" });
  const analysisStdout = analyze();
  assert.match(analysisStdout, /Human-rating analysis complete for 10 complete scenarios/);
  const report = JSON.parse(await readFile(path.join(analysisOut, "report.json"), "utf8"));
  assert.equal(report.scenarioCount, 10);
  assert.equal(report.matchedOutputCount, 40);
  assert.equal(report.coverage.expectedOutputs, 40);
  assert.equal(report.interRater.overall.kappa, 1);
  assert.equal(report.comparisons.find((row) => row.metric === "overall" && row.comparator === "single_shot").verdict, "evidence-of-improvement");
  await readFile(path.join(analysisOut, "report.md"), "utf8");
  await readFile(path.join(analysisOut, "adjudication.csv"), "utf8");

  const tamperedR1Path = path.join(temp, "tampered-rater-1.csv");
  const tamperedRows = submitRatings(r1Rows);
  tamperedRows[0].brief = "tampered after packet export";
  await writeFile(tamperedR1Path, serializeCsv(tamperedRows, RATER_COLUMNS), "utf8");
  assert.throws(() => analyze(tamperedR1Path), /integrity check failed: rater1CsvSha256/);
});
