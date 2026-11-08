const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const MAX_BACKOFF_EXPONENT = 6;

/**
 * Return a capped exponential retry delay for a 1-based failed-attempt count.
 * Invalid counts fail closed rather than scheduling an immediate retry loop.
 */
export function getOfflineEvidenceRetryDelay(attempts) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new TypeError("Retry attempts must be a positive safe integer");
  }
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** Math.min(attempts - 1, MAX_BACKOFF_EXPONENT)));
}

/** Failures that require a human decision must never be retried automatically. */
export function offlineEvidenceFailureRequiresReview(error) {
  const message = typeof error === "string"
    ? error
    : error && typeof error === "object" && typeof error.message === "string"
      ? error.message
      : String(error ?? "");
  return /EVIDENCE_REVISION_CONFLICT|IDEMPOTENCY_CONFLICT|conflict|changed in another session|not found|forbidden|unauthorized|validation|permission/i.test(message);
}

/** Whether a lifecycle-triggered sync must respect an already scheduled retry. */
export function shouldDeferOfflineEvidenceSync(retryPending, force = false) {
  return Boolean(retryPending) && !force;
}
