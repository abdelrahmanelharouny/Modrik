import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSchemaInventory } from "../scripts/schema-inventory.mjs";
import { renderPostgresSchema } from "../scripts/sync-postgres-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

test("schema inventory is deterministic and explicitly not a deployed baseline", () => {
  const first = buildSchemaInventory(sqlite);
  assert.deepEqual(first, buildSchemaInventory(sqlite));
  assert.equal(first.scope, "repository-schema-only");
  assert.equal(first.status, "inventory-only-not-a-deployed-database-baseline");
  assert.equal(first.migrationBaseline, null);
  assert.ok(first.models.includes("User"));
  assert.match(first.providers.sqlite.sha256, /^[a-f0-9]{64}$/);
  assert.match(first.providers.postgresql.sha256, /^[a-f0-9]{64}$/);
});

test("inventory rejects provider drift and schema divergence", () => {
  assert.throws(() => buildSchemaInventory(sqlite.replace('provider = "sqlite"', 'provider = "postgresql"')), /Canonical schema provider/);
  assert.throws(() => buildSchemaInventory(sqlite, renderPostgresSchema(sqlite).replace("model User {", "model Account {")), /deterministic provider-only transform/);
});
