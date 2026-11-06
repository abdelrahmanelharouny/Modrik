const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim();
}

/** Stable DB predicate: lease-expired processing rows are eligible for reclaim. */
export function buildOrganizationMemoryEmbeddingClaimFilter(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError("A valid claim time is required.");
  return {
    OR: [
      { status: "pending", availableAt: { lte: now } },
      { status: "processing", leaseExpiresAt: { lte: now } },
    ],
  };
}

/** Build a bounded lease update. Callers must claim with a DB compare-and-swap. */
export function buildOrganizationMemoryEmbeddingLease(input = {}) {
  const workerId = required(input.workerId, "workerId");
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError("A valid lease timestamp is required.");
  const leaseMs = Number.isSafeInteger(input.leaseMs) ? Math.max(15_000, Math.min(input.leaseMs, 15 * 60_000)) : DEFAULT_LEASE_MS;
  return {
    status: "processing",
    lockedAt: now,
    lockedBy: workerId,
    leaseExpiresAt: new Date(now.getTime() + leaseMs),
  };
}

/** Exponential retry with deterministic cap; do not include provider secrets in error text. */
export function buildOrganizationMemoryEmbeddingRetry(input = {}) {
  const attempts = Number(input.attempts);
  const maxAttempts = Number.isSafeInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 8;
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new RangeError("attempts must be a positive integer.");
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) throw new TypeError("A valid retry timestamp is required.");
  const base = Number.isSafeInteger(input.baseDelayMs) && input.baseDelayMs > 0 ? input.baseDelayMs : 5_000;
  const delay = Math.min(MAX_BACKOFF_MS, base * (2 ** Math.min(attempts - 1, 20)));
  const rawError = typeof input.error === "string" ? input.error : "Embedding job failed.";
  const safeError = rawError.replace(/(?:bearer\s+)[^\s]+/giu, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/giu, "$1=[redacted]")
    .slice(0, 500);
  const dead = attempts >= maxAttempts;
  return {
    status: dead ? "dead" : "pending",
    attempts,
    availableAt: dead ? now : new Date(now.getTime() + delay),
    lockedAt: null,
    lockedBy: null,
    lastError: safeError,
    delayMs: dead ? 0 : delay,
  };
}

/** Complete only when the worker still owns the lease, preventing stale workers overwriting newer work. */
export function buildOrganizationMemoryEmbeddingCompletion(input = {}) {
  return {
    where: {
      id: required(input.jobId, "jobId"),
      status: "processing",
      lockedBy: required(input.workerId, "workerId"),
      lockedAt: input.lockedAt,
    },
    data: {
      status: "completed",
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  };
}

/** Delete jobs are tombstones; upserts are discarded when their source hash is no longer current. */
export function classifyOrganizationMemoryEmbeddingWork(input = {}) {
  const operation = required(input.operation, "operation");
  if (operation === "delete") return { action: "delete", nodeId: required(input.nodeId, "nodeId") };
  if (operation !== "upsert") throw new TypeError("Unsupported embedding operation.");
  const queuedHash = required(input.contentHash, "contentHash");
  const currentHash = typeof input.currentContentHash === "string" ? input.currentContentHash : null;
  if (input.currentNodeStatus !== "accepted" || currentHash !== queuedHash) {
    return { action: "superseded", reason: "source_changed_or_not_accepted" };
  }
  return { action: "embed", contentHash: queuedHash };
}
