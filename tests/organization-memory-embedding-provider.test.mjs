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
  await assert.rejects(() => requestProvider.embed("text"), /Embedding provider request timed out\./);

  const bodyProvider = await createOrganizationMemoryEmbeddingProvider({
    env,
    fetch: async () => ({ ok: true, json: async () => { throw abort; } }),
  });
  await assert.rejects(() => bodyProvider.embed("text"), /Embedding provider request timed out\./);
});


test("E5 Large Instruct applies the configured task instruction to queries only", async () => {
  const instruction = "Retrieve accepted project decisions and evidence relevant to the query.";
  const e5Env = {
    ...env,
    ORGANIZATION_MEMORY_EMBEDDING_MODEL: "intfloat/multilingual-e5-large-instruct",
    ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS: "1024",
    ORGANIZATION_MEMORY_EMBEDDING_QUERY_INSTRUCTION: instruction,
  };
  const requests = [];
  const vector = [1, ...Array(1023).fill(0)];
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env: e5Env,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({
          model: "intfloat/multilingual-e5-large-instruct",
          data: [{ embedding: vector }],
        }),
      };
    },
  });

  await provider.embed("Where was the risk accepted?", { role: "query" });
  await provider.embed("kind: decision\nlabel: Risk acceptance", { role: "document" });

  assert.equal(requests[0].input, `Instruct: ${instruction}\nQuery: Where was the risk accepted?`);
  assert.equal(requests[1].input, "kind: decision\nlabel: Risk acceptance");
  assert.equal(requests[0].model, "intfloat/multilingual-e5-large-instruct");
  assert.equal(requests[0].dimensions, 1024);
});

test("E5 query instruction rejects empty and overlong configuration", async () => {
  await assert.rejects(
    () => createOrganizationMemoryEmbeddingProvider({
      env: { ...env, ORGANIZATION_MEMORY_EMBEDDING_MODEL: "intfloat/multilingual-e5-large-instruct", ORGANIZATION_MEMORY_EMBEDDING_QUERY_INSTRUCTION: " " },
    }),
    /query instruction/i,
  );
  await assert.rejects(
    () => createOrganizationMemoryEmbeddingProvider({
      env: { ...env, ORGANIZATION_MEMORY_EMBEDDING_MODEL: "intfloat/multilingual-e5-large-instruct", ORGANIZATION_MEMORY_EMBEDDING_QUERY_INSTRUCTION: "x".repeat(501) },
    }),
    /query instruction/i,
  );
});


test("Granite multilingual R2 sends unprefixed Arabic, English and code-switched query/document text", async () => {
  const model = "ibm-granite/granite-embedding-97m-multilingual-r2";
  const graniteEnv = {
    ...env,
    ORGANIZATION_MEMORY_EMBEDDING_MODEL: model,
    ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS: "384",
  };
  const requests = [];
  const vector = [1, ...Array(383).fill(0)];
  const provider = await createOrganizationMemoryEmbeddingProvider({
    env: graniteEnv,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {
        ok: true,
        json: async () => ({ model, data: [{ embedding: vector }] }),
      };
    },
  });

  const query = "ازاي نراجع القرار المرتبط بال OAuth callback؟";
  const document = "kind: decision\nlabel: OAuth callback review\ndescription: Verify PKCE and state";
  await provider.embed(query, { role: "query" });
  await provider.embed(document, { role: "document" });

  assert.equal(requests[0].input, query);
  assert.equal(requests[1].input, document);
  assert.equal(requests[0].model, model);
  assert.equal(requests[0].dimensions, 384);
});
