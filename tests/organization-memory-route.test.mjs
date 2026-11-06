import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = path.join(root, "src", "app", "api", "organizations", "knowledge-memory", "route.ts");

test("ranked organization-memory response limit is initialized before the streaming scan", () => {
  const source = fs.readFileSync(routePath, "utf8");
  const limitDeclaration = source.indexOf("const responseLimit = Math.min(limit ?? 25, 100);");
  const scanInvocation = source.indexOf("rankOrganizationMemoryCandidatesStream({");
  assert.ok(limitDeclaration >= 0, "ranked response limit must be declared");
  assert.ok(scanInvocation >= 0, "ranked search must invoke the streaming ranker");
  assert.ok(limitDeclaration < scanInvocation, "responseLimit must be initialized before it is passed to the ranker");
});

test("organization-memory search rejects oversized raw queries before database access", () => {
  const source = fs.readFileSync(routePath, "utf8");
  const validation = source.indexOf('if (search && search.length > 120)');
  const projectQuery = source.indexOf("db.project.findMany({");
  assert.ok(validation >= 0, "query length must be bounded");
  assert.ok(projectQuery >= 0, "project scope query must exist");
  assert.ok(validation < projectQuery, "query validation must happen before database access");
});

test("organization-memory API limit contract matches the ranking and page caps", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /Number\(rawLimit\) > 100/);
  assert.match(source, /limit must be an integer between 1 and 100/);
  assert.doesNotMatch(source, /Number\(rawLimit\) > 1000/);
});


test("KnowledgeNode create and update maintain the lexical index in the same transaction", () => {
  const source = fs.readFileSync(path.join(root, "src", "app", "api", "projects", "[id]", "knowledge-graph", "route.ts"), "utf8");
  assert.match(source, /db\.\$transaction\(async \(tx\) => \{[\s\S]*?tx\.knowledgeNode\.create\([\s\S]*?replaceOrganizationMemorySearchDocument\(tx, created\)/);
  assert.match(source, /tx\.knowledgeNode\.update\([\s\S]*?replaceOrganizationMemorySearchDocument\(tx, updated\)/);
});

test("organization governance transitions update the lexical index atomically", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /tx\.knowledgeNode\.updateMany\([\s\S]*?replaceOrganizationMemorySearchDocument\(tx, updated\)/);
});


test("ranked retrieval exposes indexed readiness and an actionable streaming fallback reason", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /indexedFallbackReason: "indexed_read_disabled"/);
  assert.match(source, /"index_state_missing"/);
  assert.match(source, /"backfill_incomplete"/);
  assert.match(source, /"reconciliation_mismatch"/);
  assert.match(source, /indexedReadiness: scan!\.indexReadiness/);
});


test("indexed retrieval diagnostics include posting work as well as readiness and fallback", () => {
  const source = fs.readFileSync(routePath, "utf8");
  assert.match(source, /retrievalPostingsScanned: "postingsScanned" in scan!/);
  assert.match(source, /candidateFirstPassPages/);
  assert.match(source, /candidateSecondPassPages/);
});
