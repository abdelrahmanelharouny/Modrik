import test from "node:test";
import assert from "node:assert/strict";
import { createPasswordResetToken, getPasswordResetState, hashPasswordResetToken, PASSWORD_RESET_TTL_MS } from "../src/lib/security/password-reset.mjs";

test("password reset tokens are 256-bit base64url values and only hashes are persisted", () => {
  const token = createPasswordResetToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashPasswordResetToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashPasswordResetToken(token), token);
  assert.equal(hashPasswordResetToken(token), hashPasswordResetToken(token));
  assert.equal(hashPasswordResetToken("short"), null);
  assert.equal(PASSWORD_RESET_TTL_MS, 30 * 60 * 1000);
});

test("password reset state rejects used, revoked, and expired tokens", () => {
  const now = 1_800_000_000_000;
  assert.equal(getPasswordResetState({ expiresAt: new Date(now + 1) }, now), "pending");
  assert.equal(getPasswordResetState({ expiresAt: new Date(now) }, now), "expired");
  assert.equal(getPasswordResetState({ expiresAt: new Date(now + 1), usedAt: new Date(now) }, now), "used");
  assert.equal(getPasswordResetState({ expiresAt: new Date(now + 1), revokedAt: new Date(now) }, now), "revoked");
  assert.equal(getPasswordResetState(null, now), "invalid");
});
