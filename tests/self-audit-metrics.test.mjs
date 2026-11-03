import test from "node:test";
import assert from "node:assert/strict";
import {
  auditDataAvailability,
  auditConsentCoverage,
  auditCredentialEncryption,
  auditSourceCheck,
  nearestRankPercentile,
} from "../src/lib/audit/metrics.mjs";

test("empty runtime telemetry is not-assessed, not an automatic pass", () => {
  assert.equal(auditDataAvailability(0, 0, 90_000).status, "not-assessed");
  assert.equal(auditDataAvailability(0, 0, 0.05).status, "not-assessed");
});

test("consent metrics represent AI eligibility, not legal compliance", () => {
  assert.equal(auditConsentCoverage(0, 0).status, "not-assessed");
  assert.equal(auditConsentCoverage(4, 4).status, "pass");
  assert.equal(auditConsentCoverage(4, 3).status, "warn");
  assert.match(auditConsentCoverage(4, 3).detail, /excluded from model prompts/);
});

test("credential storage warns about legacy plaintext records", () => {
  assert.equal(auditCredentialEncryption([]).status, "not-assessed");
  assert.equal(auditCredentialEncryption([{ encrypted: true }, { encrypted: true }]).status, "pass");
  assert.equal(auditCredentialEncryption([{ encrypted: true }, { encrypted: false }]).status, "warn");
});

test("source checks fail visibly instead of being hard-coded as pass", () => {
  assert.equal(auditSourceCheck(true, "ok", "bad").status, "pass");
  assert.equal(auditSourceCheck(false, "ok", "bad").status, "warn");
  assert.equal(auditSourceCheck(null, "ok", "bad").status, "not-assessed");
});

test("p95 nearest-rank calculation is correct for small samples", () => {
  assert.equal(nearestRankPercentile([], 0.95), null);
  assert.equal(nearestRankPercentile([7, 1, 3, 2], 0.5), 2);
  assert.equal(nearestRankPercentile([1, 2, 3, 4, 5], 0.95), 5);
});
