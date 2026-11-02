import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
  assert.throws(() => buildSchemaInventory(sqlite.replace('provider = "sqlite"', 'provider = "postgresql"')), /datasource provider must be/);
  assert.throws(() => buildSchemaInventory(sqlite, renderPostgresSchema(sqlite).replace("model User {", "model Account {")), /deterministic provider-only transform/);
});

test("migration deployment entry point refuses execution even with caller-supplied approval flags", () => {
  const script = path.join(root, "scripts", "guarded-migrate-deploy.mjs");
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      MODRIK_MIGRATIONS_ENABLED: "true",
      MODRIK_MIGRATION_BASELINE_ID: "reviewed-baseline",
      MODRIK_MIGRATION_APPROVED: "yes",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no production runner is implemented/);
});
