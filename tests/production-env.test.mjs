import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionEnv } from "../scripts/validate-production-env.mjs";

const validEnv = {
  DATABASE_URL: "postgresql://modrik:secret@db.example.test:5432/modrik",
  MODRIK_ADMIN_EMAIL: "admin@example.test",
  MODRIK_ADMIN_PASSWORD_HASH: "$scrypt$16384$8$1$" + "a".repeat(32) + "$" + "b".repeat(64),
  MODRIK_AUTH_SECRET: "a".repeat(32),
  MODRIK_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-redis-token",
  RESEND_API_KEY: "re_test-key",
  PASSWORD_RESET_EMAIL_FROM: "Modrik Security <security@example.test>",
  APP_URL: "https://app.example.test",
};

test("production release configuration accepts a complete valid environment", () => {
  assert.deepEqual(validateProductionEnv(validEnv), { ok: true, errors: [] });
});
test("production release configuration reports missing variables by name only", () => {
  const result = validateProductionEnv({});
  assert.equal(result.ok, false);
  for (const name of ["DATABASE_URL", "MODRIK_AUTH_SECRET", "UPSTASH_REDIS_REST_TOKEN", "RESEND_API_KEY"]) {
    assert.ok(result.errors.some((error) => error.startsWith(name)));
  }
  assert.equal(result.errors.some((error) => error.includes("secret-token-value")), false);
});
test("production release configuration rejects unsafe providers and weak cryptographic values", () => {
  const result = validateProductionEnv({
    ...validEnv,
    DATABASE_URL: "file:./local.db",
    MODRIK_AUTH_SECRET: "short",
    MODRIK_ENCRYPTION_KEY: "not-a-key",
    UPSTASH_REDIS_REST_URL: "http://redis.example.test",
    APP_URL: "http://app.example.test",
    MODRIK_ADMIN_PASSWORD_HASH: "plaintext",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("PostgreSQL")));
  assert.ok(result.errors.some((error) => error.includes("32 bytes")));
  assert.ok(result.errors.some((error) => error.includes("scrypt")));
  assert.ok(result.errors.some((error) => error.includes("HTTPS")));
});
