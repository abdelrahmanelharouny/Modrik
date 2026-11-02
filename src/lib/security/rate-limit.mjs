import { createHash } from "node:crypto";

const localBuckets = new Map();
const LUA_FIXED_WINDOW = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
local ttl = redis.call("PTTL", KEYS[1])
return { count, ttl }
`;

function denied(retryAfterSeconds, backend) {
  return { allowed: false, remaining: 0, retryAfterSeconds, backend };
}

function validateInput({ scope, identifier, limit, windowMs }) {
  if (typeof scope !== "string" || !/^[a-z0-9:_-]{1,80}$/i.test(scope)) throw new TypeError("Invalid rate-limit scope");
  if (typeof identifier !== "string" || !identifier || identifier.length > 512) throw new TypeError("Invalid rate-limit identifier");
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new TypeError("Rate-limit limit must be an integer between 1 and 10000");
  if (!Number.isInteger(windowMs) || windowMs < 1000 || windowMs > 86400000) throw new TypeError("Rate-limit window must be between 1 second and 24 hours");
}

function localConsume(key, limit, windowMs, now) {
  if (localBuckets.size > 8000) {
    for (const [entry, bucket] of localBuckets) if (bucket.resetAt <= now) localBuckets.delete(entry);
  }
  if (localBuckets.size >= 10000 && !localBuckets.has(key)) return denied(60, "memory-capacity");
  const previous = localBuckets.get(key);
  const bucket = previous && previous.resetAt > now
    ? previous
    : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  localBuckets.set(key, bucket);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return bucket.count <= limit
    ? { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds, backend: "memory" }
    : denied(retryAfterSeconds, "memory");
}

export function isDistributedRateLimitConfigured(env = process.env) {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return false;
  try {
    const url = new URL(env.UPSTASH_REDIS_REST_URL);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

export async function consumeRateLimit(input, options = {}) {
  validateInput(input);
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const digest = createHash("sha256").update(input.identifier, "utf8").digest("hex");
  const key = `modrik:rl:${input.scope}:${digest}`;

  if (!isDistributedRateLimitConfigured(env)) {
    if (env.NODE_ENV === "production") return denied(Math.ceil(input.windowMs / 1000), "unavailable");
    return localConsume(key, input.limit, input.windowMs, now);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(env.UPSTASH_REDIS_REST_URL.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", LUA_FIXED_WINDOW, "1", key, String(input.windowMs)]),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return denied(Math.ceil(input.windowMs / 1000), "unavailable");
    const payload = await response.json();
    if (payload?.error || !Array.isArray(payload?.result) || payload.result.length < 2) {
      return denied(Math.ceil(input.windowMs / 1000), "unavailable");
    }
    const count = Number(payload.result[0]);
    const ttl = Number(payload.result[1]);
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(ttl) || ttl < 0) {
      return denied(Math.ceil(input.windowMs / 1000), "unavailable");
    }
    const retryAfterSeconds = Math.max(1, Math.ceil(ttl / 1000));
    return count <= input.limit
      ? { allowed: true, remaining: Math.max(0, input.limit - count), retryAfterSeconds, backend: "upstash" }
      : denied(retryAfterSeconds, "upstash");
  } catch {
    // Fail closed: an unavailable shared limiter must never silently downgrade
    // production authentication endpoints to process-local counters.
    return denied(Math.ceil(input.windowMs / 1000), "unavailable");
  }
}
