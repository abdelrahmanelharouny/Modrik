import test from "node:test";
import assert from "node:assert/strict";
import { getOfflineEvidenceRetryDelay, offlineEvidenceFailureRequiresReview, shouldDeferOfflineEvidenceSync } from "../src/lib/evidence/offline-retry.mjs";

test("offline evidence retry delay grows exponentially and caps at five minutes", () => {
  assert.equal(getOfflineEvidenceRetryDelay(1), 5_000);
  assert.equal(getOfflineEvidenceRetryDelay(2), 10_000);
  assert.equal(getOfflineEvidenceRetryDelay(3), 20_000);
  assert.equal(getOfflineEvidenceRetryDelay(6), 160_000);
  assert.equal(getOfflineEvidenceRetryDelay(7), 300_000);
  assert.equal(getOfflineEvidenceRetryDelay(20), 300_000);
});

test("offline evidence retry delay rejects invalid attempt counts", () => {
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, "2"]) {
    assert.throws(() => getOfflineEvidenceRetryDelay(value), /positive safe integer/);
  }
});

test("revision, authorization, validation and idempotency conflicts require human review", () => {
  for (const message of [
    "EVIDENCE_REVISION_CONFLICT",
    "The evidence changed in another session",
    "IDEMPOTENCY_CONFLICT",
    "Forbidden",
    "Unauthorized",
    "Validation failed",
    "Resource not found",
    "Permission denied",
  ]) {
    assert.equal(offlineEvidenceFailureRequiresReview(message), true, message);
  }
});

test("transient network and service failures remain eligible for automatic retry", () => {
  for (const message of ["fetch failed", "ECONNRESET", "HTTP 503", "HTTP 429", "gateway timeout"]) {
    assert.equal(offlineEvidenceFailureRequiresReview(message), false, message);
  }
});

test("lifecycle recovery respects a pending retry while explicit retry can override it", () => {
  assert.equal(shouldDeferOfflineEvidenceSync(true, false), true);
  assert.equal(shouldDeferOfflineEvidenceSync(true, true), false);
  assert.equal(shouldDeferOfflineEvidenceSync(false, false), false);
});

