const DEFAULT_LEASE_MS = 120_000;
const MAX_LEASE_MS = 900_000;
const MAX_BACKOFF_MS = 21_600_000;

export class PipelineJobLeaseLostError extends Error {
  constructor() {
    super("Pipeline job lease was lost; stale worker cannot persist results.");
    this.name = "PipelineJobLeaseLostError";
    this.code = "PIPELINE_JOB_LEASE_LOST";
  }
}
function validDate(value, name) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${name} must be a valid date.`);
  return date;
}
function required(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim();
}
export function buildPipelineJobClaimFilter(now = new Date()) {
  const at = validDate(now, "now");
  return { OR: [
    { status: "queued", availableAt: { lte: at } },
    { status: "retry_wait", availableAt: { lte: at } },
    { status: "running", leaseExpiresAt: { lte: at } },
  ] };
}
export function buildPipelineJobLease(input = {}) {
  const workerId = required(input.workerId, "workerId");
  const leaseToken = required(input.leaseToken, "leaseToken");
  const now = validDate(input.now, "now");
  const requested = Number(input.leaseMs);
  const leaseMs = Number.isSafeInteger(requested) ? Math.max(30_000, Math.min(requested, MAX_LEASE_MS)) : DEFAULT_LEASE_MS;
  return { status: "running", lockedAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), lockedBy: workerId, leaseToken, startedAt: now };
}
export function buildPipelineJobOwnershipFilter(input = {}) {
  return { id: required(input.jobId, "jobId"), status: "running", lockedBy: required(input.workerId, "workerId"), leaseToken: required(input.leaseToken, "leaseToken") };
}
export function buildPipelineJobHeartbeatData(input = {}) {
  const now = validDate(input.now, "now");
  const leaseMs = Number.isSafeInteger(input.leaseMs) ? Math.max(30_000, Math.min(input.leaseMs, MAX_LEASE_MS)) : DEFAULT_LEASE_MS;
  return { leaseExpiresAt: new Date(now.getTime() + leaseMs) };
}
export function sanitizePipelineJobError(value) {
  const raw = value instanceof Error ? value.message : String(value ?? "Agent worker failed.");
  return raw.replace(/bearer\s+[^\s,;]+/giu, "Bearer [redacted]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/giu, "$1[redacted]")
    .replace(/([?&](?:access_token|api_key|token|secret|key)=)[^&#\s]+/giu, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[redacted-key]").slice(0, 700);
}
export function buildPipelineJobRetry(input = {}) {
  const attempts = Number(input.attempts);
  const maxAttempts = Number.isSafeInteger(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 5;
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new RangeError("attempts must be a positive integer.");
  const now = validDate(input.now, "now");
  const base = Number.isSafeInteger(input.baseDelayMs) && input.baseDelayMs > 0 ? input.baseDelayMs : 5_000;
  const delayMs = Math.min(MAX_BACKOFF_MS, base * (2 ** Math.min(attempts - 1, 20)));
  const dead = attempts >= maxAttempts || input.permanent === true;
  return {
    status: dead ? "dead" : "retry_wait", attempts,
    availableAt: dead ? now : new Date(now.getTime() + delayMs),
    lockedAt: null, leaseExpiresAt: null, lockedBy: null, leaseToken: null,
    lastError: sanitizePipelineJobError(input.error), completedAt: dead ? now : null, delayMs: dead ? 0 : delayMs,
  };
}
export function isRetryablePipelineFailure(error) {
  const message = sanitizePipelineJobError(error).toLowerCase();
  return !/(?:\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid api key|missing (?:an? )?(?:api )?(?:key|credential)|unsupported provider|unknown planner arm|invalid production configuration)/u.test(message);
}
