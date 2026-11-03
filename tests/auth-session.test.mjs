import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_TTL_SECONDS,
  verifyAdminCredentials,
  verifySessionToken,
} from "../src/lib/security/session.mjs";

const secret = "a".repeat(64);
const env = {
  MODRIK_ADMIN_EMAIL: "owner@example.com",
  MODRIK_ADMIN_PASSWORD_HASH: "$scrypt$16384$8$1$" + "11".repeat(16) + "$" + "22".repeat(32),
  MODRIK_AUTH_SECRET: secret,
};

test("auth is fail-closed until every required owner secret is configured", () => {
  assert.equal(isAuthConfigured({}), false);
  assert.equal(isAuthConfigured({ ...env, MODRIK_AUTH_SECRET: "short" }), false);
  assert.equal(isAuthConfigured(env), true);
});

test("signed owner sessions verify, expire and reject tampering", () => {
  const now = 1_800_000_000_000;
  const token = createSessionToken("Owner@Example.com", secret, now);
  const valid = verifySessionToken(token, secret, now + 1000);
  assert.equal(valid?.email, "owner@example.com");
  assert.equal(valid?.role, "owner");
  assert.equal(valid?.expiresAt, Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  assert.equal(verifySessionToken(token, secret + "wrong", now), null);
  assert.equal(verifySessionToken(token + "x", secret, now), null);
  assert.equal(verifySessionToken(token, secret, now + (SESSION_TTL_SECONDS + 1) * 1000), null);
});

test("owner credentials use the expected bounded scrypt hash format", async () => {
  const password = "a-long-owner-password-2026";
  const salt = Buffer.from("11223344556677889900aabbccddeeff", "hex");
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const hashedEnv = {
    ...env,
    MODRIK_ADMIN_PASSWORD_HASH:
      "$scrypt$16384$8$1$" + salt.toString("hex") + "$" + key.toString("hex"),
  };
  assert.equal(await verifyAdminCredentials("OWNER@example.com", password, hashedEnv), true);
  assert.equal(await verifyAdminCredentials("owner@example.com", "wrong-password", hashedEnv), false);
  assert.equal(await verifyAdminCredentials("other@example.com", password, hashedEnv), false);
});

test("malformed or out-of-range scrypt parameters fail without attempting password verification", async () => {
  const malformed = { ...env, MODRIK_ADMIN_PASSWORD_HASH: "$scrypt$999999$8$1$" + "11".repeat(16) + "$" + "22".repeat(32) };
  assert.equal(await verifyAdminCredentials("owner@example.com", "password", malformed), false);
});
