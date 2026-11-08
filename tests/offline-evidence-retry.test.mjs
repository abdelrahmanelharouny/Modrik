import test from "node:test";
import assert from "node:assert/strict";
import { getOfflineEvidenceRetryDelay, offlineEvidenceFailureRequiresReview, shouldDeferOfflineEvidenceSync } from "../src/lib/evidence/offline-retry.mjs";
import { createOfflineEvidenceRetryScheduler } from "../src/lib/evidence/offline-retry-scheduler.mjs";

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


test("retry scheduler defers lifecycle recovery and explicit retry cancels the scheduled timer", () => {
  let nextId = 0;
  const timers = new Map();
  const scheduler = createOfflineEvidenceRetryScheduler({
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
  });
  let retryCount = 0;
  scheduler.schedule(5_000, () => { retryCount += 1; });
  assert.equal(scheduler.isPending(), true);
  assert.equal(timers.size, 1);
  assert.equal(shouldDeferOfflineEvidenceSync(scheduler.isPending(), false), true,
    "focus/online/pageshow/visibility recovery must leave the scheduled timer intact");
  assert.equal(shouldDeferOfflineEvidenceSync(scheduler.isPending(), true), false,
    "the explicit Retry queue action may override backoff");
  assert.equal(scheduler.cancel(), true);
  assert.equal(scheduler.isPending(), false);
  assert.equal(timers.size, 0);
  assert.equal(retryCount, 0, "cancelled backoff must not run after an explicit retry");
});

test("retry scheduler fires once, clears pending state and replaces older timers", () => {
  let nextId = 0;
  const timers = new Map();
  const scheduler = createOfflineEvidenceRetryScheduler({
    setTimeoutFn(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) { timers.delete(id); },
  });
  let fired = 0;
  scheduler.schedule(5_000, () => { fired += 1; });
  scheduler.schedule(10_000, () => { fired += 10; });
  assert.equal(timers.size, 1, "only one retry timer may be active");
  const [timer] = timers.values();
  assert.equal(timer.delay, 10_000);
  timer.callback();
  assert.equal(fired, 10);
  assert.equal(scheduler.isPending(), false);
  assert.equal(scheduler.cancel(), false);
});

test("retry scheduler validates inputs and can be cancelled during component cleanup", () => {
  const timers = new Map();
  let nextId = 0;
  const scheduler = createOfflineEvidenceRetryScheduler({
    setTimeoutFn(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeoutFn(id) { timers.delete(id); },
  });
  assert.throws(() => scheduler.schedule(-1, () => {}), /nonnegative finite/);
  assert.throws(() => scheduler.schedule(10, null), /callback/);
  scheduler.schedule(5_000, () => assert.fail("unmounted component must not retry"));
  assert.equal(scheduler.cancel(), true);
  assert.equal(timers.size, 0);
});
