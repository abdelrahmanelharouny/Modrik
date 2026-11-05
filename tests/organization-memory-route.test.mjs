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
