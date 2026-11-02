import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPostgresSchema } from "../scripts/sync-postgres-schema.mjs";
import { validateProviderSchemaParity } from "../scripts/validate-provider-schema-parity.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqliteSchema = fs.readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");

test("PostgreSQL schema renderer changes only the datasource provider", () => {
  const postgres = renderPostgresSchema(sqliteSchema);
  assert.match(postgres, /provider\s*=\s*"postgresql"/);
  assert.equal(postgres.replace('provider = "postgresql"', 'provider = "sqlite"').replace(/^.*?\n\n/, ""), sqliteSchema);
});

test("schema parity rejects provider drift and independent model edits", () => {
  const generated = renderPostgresSchema(sqliteSchema);
  assert.equal(validateProviderSchemaParity(sqliteSchema, generated).valid, true);
  assert.equal(validateProviderSchemaParity(sqliteSchema, generated.replace("model User {", "model Account {")).valid, false);
  assert.throws(() => renderPostgresSchema(sqliteSchema.replace('provider = "sqlite"', 'provider = "postgresql"')), /must be "sqlite"/);
});
