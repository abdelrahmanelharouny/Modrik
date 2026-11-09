import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/guarded-migrate-deploy.mjs", import.meta.url));

function runGuard(env) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("migration guard refuses execution when explicit release controls are missing", () => {
  const result = runGuard({
    MODRIK_MIGRATIONS_ENABLED: "",
    MODRIK_MIGRATION_BASELINE_ID: "",
    MODRIK_MIGRATION_APPROVED: "",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to run Prisma migrations/);
  assert.match(result.stderr, /MODRIK_MIGRATIONS_ENABLED/);
  assert.doesNotMatch(result.stderr, /secret|token|password/i);
});

test("migration guard remains fail-closed even when acknowledgement flags are present", () => {
  const result = runGuard({
    MODRIK_MIGRATIONS_ENABLED: "true",
    MODRIK_MIGRATION_BASELINE_ID: "reviewed-baseline-test",
    MODRIK_MIGRATION_APPROVED: "approved-by-test-operator",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /no production runner is implemented/);
  assert.match(result.stderr, /Refusing execution/);
});
