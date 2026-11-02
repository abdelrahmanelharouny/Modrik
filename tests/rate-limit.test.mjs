import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { consumeRateLimit, isDistributedRateLimitConfigured } from "../src/lib/security/rate-limit.mjs";

test("local development limiter enforces a fixed window and resets after expiry", async () => {
  const identifier = randomUUID();
  const input = { scope: "test:login", identifier, limit: 2, windowMs: 10_000 };
  const first = await consumeRateLimit(input, { env: { NODE_ENV: "test" }, now: 1000 });
  const second = await consumeRateLimit(input, { env: { NODE_ENV: "test" }, now: 2000 });
  const third = await consumeRateLimit(input, { env: { NODE_ENV: "test" }, now: 3000 });
  const after = await consumeRateLimit(input, { env: { NODE_ENV: "test" }, now: 12000 });
  assert.equal(first.allowed, true);
  assert.equal(second.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(after.allowed, true);
  assert.equal(after.backend, "memory");
});

test("production fails closed when shared Redis credentials are missing", async () => {
  const result = await consumeRateLimit(
    { scope: "auth:login", identifier: randomUUID(), limit: 5, windowMs: 60_000 },
    { env: { NODE_ENV: "production" } },
  );
  assert.equal(result.allowed, false);
  assert.equal(result.backend, "unavailable");
});

test("Upstash limiter uses an atomic Lua fixed-window operation and hashes identifiers", async () => {
  let request;
  const env = {
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://redis.example.test/",
    UPSTASH_REDIS_REST_TOKEN: "test-secret",
  };
  assert.equal(isDistributedRateLimitConfigured(env), true);
  const result = await consumeRateLimit(
    { scope: "auth:login", identifier: "sensitive@example.test", limit: 4, windowMs: 60_000 },
    {
      env,
      fetchImpl: async (url, init) => {
        request = { url, init, body: JSON.parse(init.body) };
        return { ok: true, json: async () => ({ result: [2, 45_000] }) };
      },
    },
  );
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
  assert.equal(result.backend, "upstash");
  assert.equal(request.url, "https://redis.example.test");
  assert.equal(request.init.headers.Authorization, "Bearer test-secret");
  assert.match(request.body[3], /^modrik:rl:auth:login:[a-f0-9]{64}$/);
  assert.equal(request.body[3].includes("sensitive@example.test"), false);
});

test("Redis failures fail closed instead of falling back to local memory", async () => {
  const result = await consumeRateLimit(
    { scope: "auth:reset", identifier: randomUUID(), limit: 3, windowMs: 60_000 },
    {
      env: { NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://redis.example.test", UPSTASH_REDIS_REST_TOKEN: "token" },
      fetchImpl: async () => { throw new Error("network unavailable"); },
    },
  );
  assert.equal(result.allowed, false);
  assert.equal(result.backend, "unavailable");
});
