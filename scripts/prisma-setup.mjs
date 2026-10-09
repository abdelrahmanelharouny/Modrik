#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — Prisma provider selection at build time
//
// WHY THIS EXISTS
//   Prisma bakes the datasource provider into the generated
//   client at `prisma generate` time. Modrik ships TWO schemas:
//     • prisma/schema.prisma          → SQLite  (local dev)
//     • prisma/schema.postgres.prisma → PostgreSQL (production)
//   This script picks the right one based on DATABASE_URL and
//   generates the client — so the same repo serves both worlds.
//
//   It also acts as a DEPLOYMENT GUARDRAIL: on Vercel, a
//   non-Postgres DATABASE_URL fails the build immediately with
//   a human-readable message instead of failing at runtime on
//   the first database call (fail-fast beats fail-cryptic).
// ─────────────────────────────────────────────────────────────

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pgSchema = join(root, "prisma", "schema.postgres.prisma");
const sqliteSchema = join(root, "prisma", "schema.prisma");

const url = process.env.DATABASE_URL ?? "";
const isPostgres = /^postgres(ql)?:\/\//i.test(url.trim());
const onVercel = Boolean(process.env.VERCEL);

if (onVercel && !isPostgres) {
  console.error(`
────────────────────────────────────────────────────────────────
✗ BUILD STOPPED — Modrik needs a PostgreSQL database on Vercel.

  DATABASE_URL is ${url ? `set to "${url.slice(0, 28)}…"` : "not set"},
  which cannot work on Vercel's serverless filesystem (no
  persistent local files, SQLite included).

  Fix (2 minutes):
    1. Create a Postgres database — Vercel Postgres, Neon,
       Supabase, or any Postgres URL.
    2. In the Vercel project → Settings → Environment Variables,
       set DATABASE_URL to the Postgres connection string.
    3. Push the schema once (from your machine):
         DATABASE_URL="postgres://…" npm run db:push:pg
    4. Redeploy.

  Full walkthrough: README.md → "Deploying to Vercel".
────────────────────────────────────────────────────────────────
`);
  process.exit(1);
}

const schema = isPostgres ? pgSchema : sqliteSchema;
if (!existsSync(schema)) {
  console.error(`✗ schema not found: ${schema}`);
  process.exit(1);
}

console.log(`▸ prisma generate (${isPostgres ? "postgresql" : "sqlite"} — ${isPostgres ? "production" : "local dev"})`);
const res = spawnSync("npx", ["prisma", "generate", "--schema", schema], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(res.status ?? 1);
