// Test-only Upstash REST emulator loaded only into the standalone E2E server.
 // It exercises the real limiter's HTTP/Lua request contract without requiring
 // external credentials or a network service. Never configure this in deployment.
const buckets = new Map();
const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init = {}) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (target !== "https://upstash-ci.invalid") return originalFetch(input, init);
  if (init.method !== "POST" || init.headers?.Authorization !== "Bearer ci-only-mock-token") {
    return { ok: false, status: 401, json: async () => ({ error: "invalid mock credentials" }) };
  }
  let command;
  try { command = JSON.parse(init.body); } catch {
    return { ok: false, status: 400, json: async () => ({ error: "invalid JSON" }) };
  }
  if (!Array.isArray(command) || command[0] !== "EVAL" || command[2] !== "1" ||
      typeof command[3] !== "string" || !/^modrik:rl:[a-z0-9:_-]+:[a-f0-9]{64}$/i.test(command[3])) {
    return { ok: false, status: 400, json: async () => ({ error: "invalid EVAL request" }) };
  }
  const windowMs = Number(command[4]);
  if (!Number.isInteger(windowMs) || windowMs < 1000) {
    return { ok: false, status: 400, json: async () => ({ error: "invalid expiry" }) };
  }
  const now = Date.now();
  const previous = buckets.get(command[3]);
  const bucket = previous && previous.resetAt > now ? previous : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(command[3], bucket);
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: [bucket.count, Math.max(0, bucket.resetAt - now)] }),
  };
};
