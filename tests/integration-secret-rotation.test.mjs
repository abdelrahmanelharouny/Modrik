import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/lib/security/secret-box.mjs";
import { rotateIntegrationConfig } from "../scripts/rotate-integration-secrets.mjs";

const oldKey = Buffer.alloc(32, 1).toString("hex");
const newKey = Buffer.alloc(32, 2).toString("hex");

test("rotates encrypted integration tokens and preserves unrelated configuration", () => {
  const original = JSON.stringify({ token: encryptSecret("ghp-sensitive-token", oldKey), owner: "modrik", repo: "app" });
  const result = rotateIntegrationConfig(original, oldKey, newKey);
  const config = JSON.parse(result.config);
  assert.equal(result.changed, true);
  assert.equal(config.owner, "modrik");
  assert.equal(config.repo, "app");
  assert.equal(decryptSecret(config.token, newKey), "ghp-sensitive-token");
  assert.throws(() => decryptSecret(config.token, oldKey));
});

test("migrates legacy plaintext tokens to authenticated ciphertext", () => {
  const result = rotateIntegrationConfig(JSON.stringify({ token: "legacy-token", projectKey: "MOD" }), oldKey, newKey);
  assert.equal(result.changed, true);
  assert.equal(decryptSecret(JSON.parse(result.config).token, newKey), "legacy-token");
});

test("rotation is idempotent when a record already uses the destination key", () => {
  const original = JSON.stringify({ token: encryptSecret("already-rotated", newKey), email: "bot@example.test" });
  const result = rotateIntegrationConfig(original, oldKey, newKey);
  assert.equal(result.changed, false);
  assert.equal(result.config, original);
});

test("rotation fails closed for corrupt ciphertext and malformed config", () => {
  assert.throws(() => rotateIntegrationConfig(JSON.stringify({ token: "enc:v1:broken" }), oldKey, newKey), /cannot be decrypted/);
  assert.throws(() => rotateIntegrationConfig(JSON.stringify({ token: "enc:v2:future-format" }), oldKey, newKey), /Unsupported encrypted credential version/);
  assert.throws(() => rotateIntegrationConfig("[]", oldKey, newKey), /JSON object/);
});
