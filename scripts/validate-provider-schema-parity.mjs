import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderPostgresSchema } from "./sync-postgres-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = path.join(root, "prisma", "schema.prisma");
const postgresPath = path.join(root, "prisma", "schema.postgres.prisma");

export function validateProviderSchemaParity(sqliteSchema, postgresSchema) {
  const errors = [];
  let expected;
  try {
    expected = renderPostgresSchema(sqliteSchema);
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  if (postgresSchema !== expected) {
    errors.push("PostgreSQL schema differs from the canonical SQLite schema beyond the datasource provider transformation; run bun run db:sync:pg and commit the generator change if needed.");
  }
  const datasourceStart = postgresSchema.indexOf("datasource db {");
  const datasourceEnd = datasourceStart < 0 ? -1 : postgresSchema.indexOf("}", datasourceStart);
  const datasource = datasourceStart < 0 || datasourceEnd < 0
    ? ""
    : postgresSchema.slice(datasourceStart, datasourceEnd + 1);
  if (!datasource.includes('provider = "postgresql"')) {
    errors.push('generated schema datasource provider must be "postgresql"');
  }
  if (datasource.includes('provider = "sqlite"')) {
    errors.push("generated PostgreSQL schema must not retain the SQLite provider");
  }
  return { valid: errors.length === 0, errors };
}

function main() {
  const result = validateProviderSchemaParity(
    fs.readFileSync(sqlitePath, "utf8"),
    fs.readFileSync(postgresPath, "utf8")
  );
  if (!result.valid) {
    console.error("[schema-parity] Validation failed:");
    for (const error of result.errors) console.error(` - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("[schema-parity] SQLite and PostgreSQL schemas are in deterministic parity.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
