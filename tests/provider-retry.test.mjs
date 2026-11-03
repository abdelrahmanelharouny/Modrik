import test from "node:test";
import assert from "node:assert/strict";
import { retryableProviderFailure } from "../src/lib/security/provider-retry.mjs";

test("provider retry policy retries transient network, timeout and server errors", () => {
  assert.equal(retryableProviderFailure(new TypeError("fetch failed")), true);
  assert.equal(retryableProviderFailure(Object.assign(new Error("request timeout"), { name: "TimeoutError" })), true);
  assert.equal(retryableProviderFailure(new Error("Provider glm HTTP 503: unavailable")), true);
  assert.equal(retryableProviderFailure(new Error("Provider glm HTTP 429: rate limited")), true);
});

test("provider retry policy does not retry permanent client or validation errors", () => {
  assert.equal(retryableProviderFailure(new Error("Provider model-b HTTP 401: unauthorized")), false);
  assert.equal(retryableProviderFailure(new Error("Provider model-b HTTP 400: bad request")), false);
  assert.equal(retryableProviderFailure(new Error("Invalid LLM JSON schema")), false);
  assert.equal(retryableProviderFailure("network failure"), false);
});
