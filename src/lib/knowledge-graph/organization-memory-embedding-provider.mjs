import { validateOrganizationMemoryVector } from "./organization-memory-embeddings.mjs";

function readConfig(env = process.env) {
  const rawEndpoint = String(env.ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT ?? "").trim();
  const apiKey = String(env.ORGANIZATION_MEMORY_EMBEDDING_API_KEY ?? "").trim();
  const model = String(env.ORGANIZATION_MEMORY_EMBEDDING_MODEL ?? "").trim();
  const dimensions = Number(env.ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS);
  if (!rawEndpoint || !model || !Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > 8192) {
    throw new Error("Organization memory embedding provider is not fully configured.");
  }
  let endpoint;
  try { endpoint = new URL(rawEndpoint); } catch { throw new Error("Embedding endpoint must be a valid URL."); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  if (endpoint.protocol !== "https:" && !(local && env.ORGANIZATION_MEMORY_EMBEDDING_ALLOW_LOCAL_HTTP === "true" && endpoint.protocol === "http:")) {
    throw new Error("Embedding endpoint must use HTTPS; local HTTP requires explicit development opt-in.");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("Embedding endpoint cannot contain credentials, query parameters or fragments.");
  }
  if (endpoint.protocol === "https:" && local) throw new Error("Use explicit local HTTP configuration for loopback embedding endpoints.");
  return { endpoint: endpoint.toString().replace(/\/$/u, ""), apiKey, model, dimensions };
}

/** OpenAI-compatible embeddings adapter. Credentials and endpoint are server-only environment configuration. */
export async function createOrganizationMemoryEmbeddingProvider(options = {}) {
  const config = readConfig(options.env ?? process.env);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) ? Math.max(1000, Math.min(options.timeoutMs, 60_000)) : 20_000;
  return {
    model: config.model,
    dimensions: config.dimensions,
    async embed(text) {
      if (typeof text !== "string" || !text.trim() || text.length > 24_000) throw new TypeError("Embedding input text is invalid.");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${config.endpoint}/embeddings`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: config.model, input: text, dimensions: config.dimensions }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Embedding provider request failed with HTTP ${response.status}.`);
        const payload = await response.json();
        const vector = payload?.data?.[0]?.embedding;
        const returnedModel = typeof payload?.model === "string" ? payload.model : config.model;
        return validateOrganizationMemoryVector({
          model: returnedModel,
          dimensions: Array.isArray(vector) ? vector.length : 0,
          vector,
        }, { model: config.model, dimensions: config.dimensions });
      } catch (error) {
        if (error?.name === "AbortError") throw new Error("Embedding provider request timed out.");
        if (error instanceof TypeError) throw error;
        throw new Error(error instanceof Error ? error.message : "Embedding provider request failed.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
