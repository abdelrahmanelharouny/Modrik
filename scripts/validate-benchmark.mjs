import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "bench", "manifest.json");
const EXPECTED_SCENARIOS = 120;

export function validateBenchmark(manifest, readScenario) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { errors: ["manifest must be an object"], summary: null };
  }
  if (manifest.name !== "arbench-v2") errors.push("manifest.name must be arbench-v2");
  if (!Array.isArray(manifest.scenarios)) errors.push("manifest.scenarios must be an array");

  const scenarios = Array.isArray(manifest.scenarios) ? manifest.scenarios : [];
  if (manifest.scenario_count !== EXPECTED_SCENARIOS) {
    errors.push(`manifest.scenario_count must remain ${EXPECTED_SCENARIOS}`);
  }
  if (scenarios.length !== EXPECTED_SCENARIOS) {
    errors.push(`manifest must contain exactly ${EXPECTED_SCENARIOS} scenarios; found ${scenarios.length}`);
  }
  if (manifest.scenario_count !== scenarios.length) {
    errors.push("scenario_count must equal the number of manifest entries");
  }

  const ids = new Set();
  const categoryDomainCounts = new Map();
  const categories = new Set();
  const domains = new Set();

  for (const [index, entry] of scenarios.entries()) {
    const label = `scenarios[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof entry.id !== "string" || !/^arb2-[a-z0-9_]+-[a-z0-9_]+-v[1-3]$/.test(entry.id)) {
      errors.push(`${label}.id is invalid`);
      continue;
    }
    if (ids.has(entry.id)) errors.push(`duplicate scenario id: ${entry.id}`);
    ids.add(entry.id);

    if (typeof entry.category !== "string" || !entry.category) errors.push(`${entry.id}: category is required`);
    if (typeof entry.domain !== "string" || !entry.domain) errors.push(`${entry.id}: domain is required`);
    if (!Array.isArray(entry.languages) || entry.languages.length === 0) errors.push(`${entry.id}: languages must be non-empty`);
    if (typeof entry.gold_type !== "string" || !entry.gold_type) errors.push(`${entry.id}: gold_type is required`);

    categories.add(entry.category);
    domains.add(entry.domain);
    const key = `${entry.category}::${entry.domain}`;
    categoryDomainCounts.set(key, (categoryDomainCounts.get(key) ?? 0) + 1);

    let scenario;
    try {
      scenario = readScenario(entry.id);
    } catch (error) {
      errors.push(`${entry.id}: scenario file missing or invalid JSON (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      errors.push(`${entry.id}: scenario root must be an object`);
      continue;
    }
    if (scenario.id !== entry.id) errors.push(`${entry.id}: file id does not match manifest id`);
    if (scenario.category !== entry.category) errors.push(`${entry.id}: category does not match manifest`);
    if (scenario.domain !== entry.domain) errors.push(`${entry.id}: domain does not match manifest`);
    if (JSON.stringify(scenario.languages) !== JSON.stringify(entry.languages)) errors.push(`${entry.id}: languages do not match manifest`);
    if (!scenario.gold || scenario.gold.type !== entry.gold_type) errors.push(`${entry.id}: gold.type does not match manifest gold_type`);
    if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0) {
      errors.push(`${entry.id}: at least one evidence item is required`);
    } else {
      const evidenceCodes = new Set();
      for (const evidence of scenario.evidence) {
        if (!evidence || typeof evidence.code !== "string" || !evidence.code.trim()) {
          errors.push(`${entry.id}: evidence item has no stable code`);
          continue;
        }
        if (evidenceCodes.has(evidence.code)) errors.push(`${entry.id}: duplicate evidence code ${evidence.code}`);
        evidenceCodes.add(evidence.code);
        if (typeof evidence.content !== "string" || !evidence.content.trim()) errors.push(`${entry.id}: evidence ${evidence.code} has empty content`);
        if (typeof evidence.consent !== "boolean") errors.push(`${entry.id}: evidence ${evidence.code} consent must be boolean`);
      }
    }
    if (!scenario.gold || !Object.hasOwn(scenario.gold, "payload")) errors.push(`${entry.id}: gold payload is required`);
  }

  if (categories.size !== 8) errors.push(`expected 8 benchmark categories; found ${categories.size}`);
  if (domains.size !== 5) errors.push(`expected 5 benchmark domains; found ${domains.size}`);
  for (const category of categories) {
    for (const domain of domains) {
      const count = categoryDomainCounts.get(`${category}::${domain}`) ?? 0;
      if (count !== 3) errors.push(`${category} / ${domain}: expected 3 scenarios; found ${count}`);
    }
  }

  return {
    errors,
    summary: {
      name: manifest.name,
      scenarioCount: scenarios.length,
      categories: categories.size,
      domains: domains.size,
      uniqueIds: ids.size,
    },
  };
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    console.error(`[benchmark] Cannot read manifest: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  const result = validateBenchmark(manifest, (id) =>
    JSON.parse(fs.readFileSync(path.join(ROOT, "bench", "scenarios", `${id}.json`), "utf8"))
  );
  if (result.errors.length) {
    console.error(`[benchmark] Validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[benchmark] Validated ${result.summary.scenarioCount} scenarios across ${result.summary.categories} categories and ${result.summary.domains} domains.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
