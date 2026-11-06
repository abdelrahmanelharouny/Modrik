import { createHash } from "node:crypto";
import { normalizeOrganizationMemoryText } from "./organization-memory-retrieval.mjs";

const MAX_EMBEDDING_DIMENSIONS = 8192;
const MAX_TEXT_LENGTH = 24_000;

function requiredString(value, field, max = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new TypeError(`${field} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

/** Canonical, versioned text used for embedding identity and safe re-embedding. */
export function buildOrganizationMemoryEmbeddingContent(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) throw new TypeError("A knowledge node is required.");
  const label = normalizeOrganizationMemoryText(node.label);
  const description = normalizeOrganizationMemoryText(node.description ?? "");
  const kind = normalizeOrganizationMemoryText(node.kind);
  if (!label || !kind) throw new TypeError("Accepted knowledge nodes require a label and kind.");
  const content = [`kind: ${kind}`, `label: ${label}`, description ? `description: ${description}` : ""]
    .filter(Boolean).join("\n");
  if (content.length > MAX_TEXT_LENGTH) throw new RangeError("Embedding content exceeds the configured text limit.");
  const contentHash = createHash("sha256").update("modrik-org-memory-embedding:v1\n").update(content).digest("hex");
  return { content, contentHash, normalizerVersion: 1 };
}

/** Validate and defensively copy a provider vector; never silently coerce NaN or strings. */
export function validateOrganizationMemoryVector(input, expected = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Embedding result must be an object.");
  const model = requiredString(input.model, "model", 160);
  if (expected.model && model !== expected.model) throw new Error("Embedding provider returned an unexpected model.");
  const dimensions = Number(input.dimensions ?? input.vector?.length);
  if (!Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > MAX_EMBEDDING_DIMENSIONS) {
    throw new RangeError("Embedding dimensions are outside the supported range.");
  }
  if (expected.dimensions && dimensions !== expected.dimensions) throw new Error("Embedding provider returned unexpected dimensions.");
  if (!Array.isArray(input.vector) || input.vector.length !== dimensions) throw new TypeError("Embedding vector length does not match its dimensions.");
  const vector = input.vector.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("Embedding vectors must contain finite numbers only.");
    return value;
  });
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm < 1e-12) throw new RangeError("Embedding vector must have a non-zero finite norm.");
  return { model, dimensions, vector, norm };
}

/** Stable identity prevents stale content or model versions from being mistaken for current embeddings. */
export function buildOrganizationMemoryEmbeddingIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Embedding identity input is required.");
  const contentHash = requiredString(input.contentHash, "contentHash", 64);
  if (!/^[a-f0-9]{64}$/u.test(contentHash)) throw new TypeError("contentHash must be a SHA-256 hex digest.");
  return {
    organizationId: requiredString(input.organizationId, "organizationId"),
    projectId: requiredString(input.projectId, "projectId"),
    nodeId: requiredString(input.nodeId, "nodeId"),
    contentHash,
    model: requiredString(input.model, "model", 160),
    dimensions: (() => {
      const dimensions = Number(input.dimensions);
      if (!Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > MAX_EMBEDDING_DIMENSIONS) {
        throw new RangeError("Embedding dimensions are invalid.");
      }
      return dimensions;
    })(),
  };
}

/**
 * Produce an idempotent work description. This function does not persist jobs;
 * callers must write it to a durable outbox in the same transaction as source changes.
 */
export function buildOrganizationMemoryEmbeddingWork(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Embedding work input is required.");
  const node = input.node;
  if (!node || typeof node !== "object") throw new TypeError("A source knowledge node is required.");
  const scope = {
    organizationId: requiredString(input.organizationId, "organizationId"),
    projectId: requiredString(node.projectId, "projectId"),
    nodeId: requiredString(node.id, "nodeId"),
  };
  if (node.status !== "accepted") {
    return { operation: "delete", ...scope, reason: "node_not_accepted" };
  }
  const model = requiredString(input.model, "model", 160);
  const dimensions = Number(input.dimensions);
  if (!Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > MAX_EMBEDDING_DIMENSIONS) {
    throw new RangeError("Configured embedding dimensions are invalid.");
  }
  const canonical = buildOrganizationMemoryEmbeddingContent(node);
  return {
    operation: "upsert",
    ...scope,
    content: canonical.content,
    contentHash: canonical.contentHash,
    normalizerVersion: canonical.normalizerVersion,
    model,
    dimensions,
    idempotencyKey: createHash("sha256").update(JSON.stringify([
      scope.organizationId, scope.projectId, scope.nodeId, canonical.contentHash, model, dimensions,
    ])).digest("hex"),
  };
}

function cosineSimilarity(left, right) {
  if (left.length !== right.length) return null;
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm < 1e-24 || rightNorm < 1e-24) return null;
  const score = dot / Math.sqrt(leftNorm * rightNorm);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null;
}

/**
 * Exact cosine ranking for a store that has already filtered by organization,
 * authorized project IDs, model and dimensions before candidate selection.
 * The function rechecks every returned row and intersects with accepted nodes.
 */
export function rankTenantScopedOrganizationMemoryEmbeddings(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Semantic ranking input is required.");
  const organizationId = requiredString(input.organizationId, "organizationId");
  const projectIds = new Set(Array.isArray(input.projectIds) ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : []);
  if (!projectIds.size) return [];
  const model = requiredString(input.model, "model", 160);
  const query = validateOrganizationMemoryVector(input.queryEmbedding, { model, dimensions: input.dimensions });
  const candidates = new Map((Array.isArray(input.candidates) ? input.candidates : [])
    .filter((node) => node && node.status === "accepted" && node.organizationId === organizationId &&
      projectIds.has(node.projectId) && typeof node.id === "string")
    .map((node) => [node.id, node]));
  if (!candidates.size) return [];
  const scored = [];
  for (const record of Array.isArray(input.embeddingRecords) ? input.embeddingRecords : []) {
    if (!record || record.organizationId !== organizationId || !projectIds.has(record.projectId) ||
        record.status !== "ready" || record.model !== model || record.dimensions !== query.dimensions ||
        !candidates.has(record.nodeId)) continue;
    let vector;
    try {
      vector = validateOrganizationMemoryVector(record, { model, dimensions: query.dimensions }).vector;
    } catch {
      continue;
    }
    const node = candidates.get(record.nodeId);
    if (record.projectId !== node.projectId || record.contentHash !== node.contentHash) continue;
    const score = cosineSimilarity(query.vector, vector);
    if (score !== null && score > 0) scored.push({ ...node, retrieval: { mode: "semantic", score: Number(score.toFixed(8)) } });
  }
  const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 25;
  return scored.sort((a, b) => b.retrieval.score - a.retrieval.score || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Explicitly states the database-side filter required before any vector top-K. */
export function buildTenantScopedEmbeddingFilter(input = {}) {
  const organizationId = requiredString(input.organizationId, "organizationId");
  const projectIds = [...new Set(Array.isArray(input.projectIds) ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : [])];
  const model = requiredString(input.model, "model", 160);
  const dimensions = Number(input.dimensions);
  if (!projectIds.length) return null;
  if (!Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > MAX_EMBEDDING_DIMENSIONS) {
    throw new RangeError("Embedding dimensions are invalid.");
  }
  return {
    organizationId,
    projectId: { in: projectIds },
    model,
    dimensions,
    status: "ready",
  };
}
