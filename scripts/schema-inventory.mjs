#!/usr/bin/env node
// Deterministic repository schema inventory. This is NOT a deployed DB baseline.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { renderPostgresSchema } from "./sync-postgres-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = path.join(root, "prisma", "schema.prisma");
const postgresPath = path.join(root, "prisma", "schema.postgres.prisma");
const manifestPath = path.join(root, "prisma", "schema-inventory.json");

export function buildSchemaInventory(sqliteSchema, postgresSchema = renderPostgresSchema(sqliteSchema)) {
  if (typeof sqliteSchema !== "string" || !sqliteSchema.trim()) throw new TypeError("Canonical SQLite schema is required");
  const datasource = /datasource\s+db\s*\{[^}]*\}/.exec(sqliteSchema)?.[0] ?? "";
  if (!/provider\s*=\s*"sqlite"/.test(datasource)) throw new Error('Canonical schema provider must be "sqlite"');
  const pgDatasource = /datasource\s+db\s*\{[^}]*\}/.exec(postgresSchema)?.[0] ?? "";
  if (!/provider\s*=\s*"postgresql"/.test(pgDatasource)) throw new Error('PostgreSQL schema provider must be "postgresql"');
  if (postgresSchema !== renderPostgresSchema(sqliteSchema)) throw new Error("PostgreSQL schema is not a deterministic provider-only transform");
  const digest = (value) => createHash("sha256").update(value, "utf8").digest("hex");
  const models = [...sqliteSchema.matchAll(/^model\s+([A-Za-z_]\w*)\s*\{/gm)].map((match) => match[1]);
  if (!models.length || new Set(models).size !== models.length) throw new Error("Schema model inventory is empty or contains duplicates");
  return {
    formatVersion: 1,
    scope: "repository-schema-only",
    status: "inventory-only-not-a-deployed-database-baseline",
    generatedFrom: "prisma/schema.prisma",
    migrationBaseline: null,
    providers: {
      sqlite: { provider: "sqlite", schemaPath: "prisma/schema.prisma", sha256: digest(sqliteSchema) },
      postgresql: { provider: "postgresql", schemaPath: "prisma/schema.postgres.prisma", sha256: digest(postgresSchema) },
    },
    models,
  };
}

function main() {
  const sqlite = fs.readFileSync(sqlitePath, "utf8");
  const postgres = fs.readFileSync(postgresPath, "utf8");
  const expected = JSON.stringify(buildSchemaInventory(sqlite, postgres), null, 2) + "\n";
  if (process.argv.includes("--write")) {
    fs.writeFileSync(manifestPath, expected, "utf8");
    console.log("[schema-inventory] Wrote deterministic repository inventory (not a deployed baseline).");
    return;
  }
  const actual = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, "utf8") : "";
  if (actual !== expected) {
    console.error("[schema-inventory] Manifest is stale. Run bun run db:inventory:write and review the diff.");
    process.exitCode = 1;
    return;
  }
  console.log("[schema-inventory] Manifest matches both provider schemas.");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
