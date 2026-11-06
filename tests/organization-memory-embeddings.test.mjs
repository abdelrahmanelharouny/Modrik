import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizationMemoryEmbeddingContent,
  validateOrganizationMemoryVector,
  buildOrganizationMemoryEmbeddingIdentity,
  buildOrganizationMemoryEmbeddingWork,
  rankTenantScopedOrganizationMemoryEmbeddings,
  buildTenantScopedEmbeddingFilter,
} from "../src/lib/knowledge-graph/organization-memory-embeddings.mjs";

const node = {
  id: "n1", projectId: "p1", organizationId: "o1", status: "accepted",
  kind: "decision", label: "Data retention policy", description: "Keep records for seven years.",
  contentHash: "hash-current",
};

test("embedding content is canonical and hashes are stable across equivalent Arabic/English text", () => {
  const a = buildOrganizationMemoryEmbeddingContent({ kind: "Decision", label: "إدارة البيانات", description: "حفظ السجلات" });
  const b = buildOrganizationMemoryEmbeddingContent({ kind: "decision", label: "ادارة البيانات", description: "حفظ السجلات" });
  assert.equal(a.content, b.content);
  assert.equal(a.contentHash, b.contentHash);
  assert.match(a.contentHash, /^[a-f0-9]{64}$/);
});

test("provider vectors are pinned to model and dimensions and reject malformed values", () => {
  assert.deepEqual(validateOrganizationMemoryVector({ model: "embed-v1", dimensions: 3, vector: [1, 0, 0] }, { model: "embed-v1", dimensions: 3 }).vector, [1, 0, 0]);
  assert.throws(() => validateOrganizationMemoryVector({ model: "other", dimensions: 3, vector: [1, 0, 0] }, { model: "embed-v1" }), /unexpected model/);
  assert.throws(() => validateOrganizationMemoryVector({ model: "embed-v1", dimensions: 2, vector: [1, 0] }, { dimensions: 3 }), /unexpected dimensions/);
  assert.throws(() => validateOrganizationMemoryVector({ model: "embed-v1", dimensions: 2, vector: [1, NaN] }), /finite numbers/);
  assert.throws(() => validateOrganizationMemoryVector({ model: "embed-v1", dimensions: 2, vector: [0, 0] }), /non-zero/);
});

test("embedding identity requires complete tenant, content and model identity", () => {
  assert.deepEqual(buildOrganizationMemoryEmbeddingIdentity({
    organizationId: "o1", projectId: "p1", nodeId: "n1", contentHash: "abc",
    model: "embed-v1", dimensions: 3,
  }), {
    organizationId: "o1", projectId: "p1", nodeId: "n1", contentHash: "abc",
    model: "embed-v1", dimensions: 3,
  });
  assert.throws(() => buildOrganizationMemoryEmbeddingIdentity({ organizationId: "o1" }), TypeError);
});

test("accepted nodes create deterministic idempotent upsert work; non-accepted nodes create delete work", () => {
  const first = buildOrganizationMemoryEmbeddingWork({ organizationId: "o1", model: "embed-v1", dimensions: 3, node });
  const second = buildOrganizationMemoryEmbeddingWork({ organizationId: "o1", model: "embed-v1", dimensions: 3, node });
  assert.equal(first.operation, "upsert");
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(first.contentHash.length, 64);
  const archived = buildOrganizationMemoryEmbeddingWork({
    organizationId: "o1", model: "embed-v1", dimensions: 3, node: { ...node, status: "archived" },
  });
  assert.deepEqual(archived, { operation: "delete", organizationId: "o1", projectId: "p1", nodeId: "n1", reason: "node_not_accepted" });
});

test("semantic retrieval rechecks tenant, project, accepted status, model, dimensions and content freshness", () => {
  const results = rankTenantScopedOrganizationMemoryEmbeddings({
    organizationId: "o1", projectIds: ["p1"], model: "embed-v1", dimensions: 3,
    queryEmbedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
    candidates: [
      node,
      { ...node, id: "n2", contentHash: "hash-current" },
      { ...node, id: "cross-org", organizationId: "o2" },
      { ...node, id: "draft", status: "proposed" },
    ],
    embeddingRecords: [
      { organizationId: "o1", projectId: "p1", nodeId: "n1", status: "ready", contentHash: "hash-current", model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
      { organizationId: "o1", projectId: "p1", nodeId: "n2", status: "ready", contentHash: "stale-hash", model: "embed-v1", dimensions: 3, vector: [0.8, 0.2, 0] },
      { organizationId: "o2", projectId: "p1", nodeId: "cross-org", status: "ready", contentHash: "hash-current", model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
      { organizationId: "o1", projectId: "p1", nodeId: "draft", status: "ready", contentHash: "hash-current", model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
    ],
  });
  assert.deepEqual(results.map((row) => row.id), ["n1"]);
  assert.equal(results[0].retrieval.score, 1);
});

test("database-side semantic filter is explicit and empty scope fails closed", () => {
  assert.deepEqual(buildTenantScopedEmbeddingFilter({
    organizationId: "o1", projectIds: ["p1", "p2", "p1"], model: "embed-v1", dimensions: 3,
  }), {
    organizationId: "o1", projectId: { in: ["p1", "p2"] }, model: "embed-v1", dimensions: 3, status: "ready",
  });
  assert.equal(buildTenantScopedEmbeddingFilter({ organizationId: "o1", projectIds: [], model: "embed-v1", dimensions: 3 }), null);
});
