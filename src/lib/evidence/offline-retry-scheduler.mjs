/**
 * Own the single scheduled retry timer for one mounted evidence queue.
 * Timer functions are injectable so lifecycle/backoff behavior is deterministic
 * in tests and does not depend on wall-clock sleeps.
 */
export function createOfflineEvidenceRetryScheduler({
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  if (typeof setTimeoutFn !== "function" || typeof clearTimeoutFn !== "function") {
    throw new TypeError("Retry scheduler requires timeout functions");
  }
  let timer = null;

  return {
    isPending() {
      return timer !== null;
    },
    schedule(delayMs, callback) {
      if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError("Retry delay must be a nonnegative finite number");
      if (typeof callback !== "function") throw new TypeError("Retry callback is required");
      this.cancel();
      timer = setTimeoutFn(() => {
        timer = null;
        callback();
      }, delayMs);
      return true;
    },
    cancel() {
      if (timer === null) return false;
      clearTimeoutFn(timer);
      timer = null;
      return true;
    },
  };
}
