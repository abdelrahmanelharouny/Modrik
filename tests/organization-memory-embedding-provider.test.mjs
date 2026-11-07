import test from "node:test";
import assert from "node:assert/strict";
import { createOrganizationMemoryEmbeddingProvider } from "../src/lib/knowledge-graph/organization-memory-embedding-provider.mjs";

const env = {
  ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT: "https://embeddings.example.com/v1",
  ORGANIZATION_MEMORY_EMBEDDING_API_KEY: "secret-token",
  ORGANIZATION_MEMORY_EMBEDDING_MODEL: "embed-v1",
  ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS: "3",
};

test("OpenAI-compatible provider sends configured model and validates returned vectors", async () => {
  let request;
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ model: "embed-v1", data: [{ embedding: [1, 0, 0] }] }) };
    },
  });
  const result = await provider.embed("kind: decision");
  assert.equal(request.url, "https://embeddings.example.com/v1/embeddings");
  assert.equal(request.init.headers.authorization, "Bearer secret-token");
  assert.deepEqual(JSON.parse(request.init.body), { model: "embed-v1", input: "kind: decision", dimensions: 3 });
  assert.deepEqual(result.vector, [1, 0, 0]);
});

test("provider fails closed on insecure remote endpoints and malformed vectors", async () => {
  await assert.rejects(() => createOrganizationMemoryEmbeddingProvider({ env: { ...env, ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT: "http://remote.example.com" } }), /HTTPS/);
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: true, json: async () => ({ data: [{ embedding: [1, "bad", 0] }] }) }),
  });
  await assert.rejects(() => provider.embed("text"), /finite numbers/);
});

test("provider does not expose credentials in HTTP failure messages", async () => {
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(() => provider.embed("text"), /HTTP 401/);
  await assert.rejects(() => provider.embed("text"), (error) => !error.message.includes("secret-token"));
});

test("provider redacts transport errors that may contain endpoint or request details", async () => {
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => { throw new TypeError("fetch failed for https://embeddings.example.com/v1?token=secret-token"); },
  });
  await assert.rejects(() => provider.embed("text"), (error) => {
    assert.equal(error.message, "Embedding provider request failed.");
    assert.equal(error.message.includes("secret-token"), false);
    assert.equal(error.message.includes("embeddings.example.com"), false);
    return true;
  });
});

test("provider reports malformed response JSON without relaying parser details", async () => {
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: true, json: async () => { throw new SyntaxError("response body included secret-token"); } }),
  });
  await assert.rejects(() => provider.embed("text"), (error) => {
    assert.equal(error.message, "Embedding provider returned invalid JSON.");
    assert.equal(error.message.includes("secret-token"), false);
    return true;
  });
});

test("provider rejects a vector returned for a different model", async () => {
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: true, json: async () => ({ model: "other-model", data: [{ embedding: [1, 0, 0] }] }) }),
  });
  await assert.rejects(() => provider.embed("text"), /model/i);
});

test("provider requires non-empty bounded input before making a request", async () => {
  let calls = 0;
  const provider = await createOrganizationMemoryEmbeddingProvider({ env, fetch: async () => { calls += 1; } });
  await assert.rejects(() => provider.embed("  "), /input text is invalid/);
  await assert.rejects(() => provider.embed("x".repeat(24_001)), /input text is invalid/);
  assert.equal(calls, 0);
});

test("provider normalizes request and response-body aborts as timeouts", async () => {
  const abort = Object.assign(new Error("internal endpoint details"), { name: "AbortError" });
  const requestProvider = await createOrganizationMemoryEmbeddingProvider({ env, fetch: async () => { throw abort; } });
  await assert.rejects(() => requestProvider.embed("text"), /Embedding provider request timed out\\./);

  const bodyProvider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: true, json: async () => { throw abort; } }),
  });
  await assert.rejects(() => bodyProvider.embed("text"), /Embedding provider request timed out\\./);
});
