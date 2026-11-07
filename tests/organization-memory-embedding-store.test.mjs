import test from "node:test";
import assert from "node:assert/strict";
import {
  persistOrganizationMemoryEmbedding,
  deleteOrganizationMemoryEmbedding,
} from "../src/lib/knowledge-graph/organization-memory-embedding-store.mjs";
import { buildOrganizationMemoryEmbeddingContent } from "../src/lib/knowledge-graph/organization-memory-embeddings.mjs";

const node = {
  id: "node-1", projectId: "project-1", status: "accepted",
  kind: "decision", label: "Retention", description: "Seven years",
};
const canonical = buildOrganizationMemoryEmbeddingContent(node);

function fakeTx({ project = { id: "project-1", organizationId: "org-1" }, sourceNode = node } = {}) {
  const calls = {};
  return {
    calls,
    project: { async findFirst(args) { calls.project = args; return project; } },
    knowledgeNode: { async findFirst(args) { calls.node = args; return sourceNode; } },
    organizationMemoryEmbedding: {
      async upsert(args) { calls.upsert = args; return { id: "embedding-1", ...args.create }; },
      async deleteMany(args) { calls.delete = args; return { count: 2 }; },
    },
  };
}

test("embedding persistence rechecks project tenant and accepted canonical node before writing", async () => {
  const tx = fakeTx();
  const result = await persistOrganizationMemoryEmbedding(tx, {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1",
    model: "embed-v1", dimensions: 3, contentHash: canonical.contentHash,
    embedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
  });
  assert.equal(result.persisted, true);
  assert.deepEqual(tx.calls.project.where, { id: "project-1", organizationId: "org-1", status: { not: "archived" } });
  assert.deepEqual(tx.calls.node.where, { id: "node-1", projectId: "project-1", status: "accepted" });
  assert.equal(tx.calls.upsert.create.organizationId, "org-1");
  assert.equal(tx.calls.upsert.create.contentHash, canonical.contentHash);
  assert.deepEqual(JSON.parse(tx.calls.upsert.create.vector), [1, 0, 0]);
});

test("embedding persistence fails closed on cross-tenant project, non-accepted node and stale content", async () => {
  const wrongTenant = await persistOrganizationMemoryEmbedding(fakeTx({
    project: { id: "project-1", organizationId: "org-2" },
  }), {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1", model: "embed-v1", dimensions: 3,
    contentHash: canonical.contentHash, embedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
  });
  assert.deepEqual(wrongTenant, { persisted: false, reason: "project_scope_mismatch" });
  const unaccepted = await persistOrganizationMemoryEmbedding(fakeTx({
    sourceNode: { ...node, status: "archived" },
  }), {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1", model: "embed-v1", dimensions: 3,
    contentHash: canonical.contentHash, embedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
  });
  assert.deepEqual(unaccepted, { persisted: false, reason: "source_node_not_accepted" });
  const stale = await persistOrganizationMemoryEmbedding(fakeTx(), {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1", model: "embed-v1", dimensions: 3,
    contentHash: "f".repeat(64), embedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] },
  });
  assert.deepEqual(stale, { persisted: false, reason: "source_content_changed" });
});

test("embedding delete requires and applies the complete tenant scope", async () => {
  const tx = fakeTx();
  const result = await deleteOrganizationMemoryEmbedding(tx, {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1", model: "embed-v1", dimensions: 3,
  });
  assert.deepEqual(result, { deleted: 2 });
  assert.deepEqual(tx.calls.delete.where, {
    organizationId: "org-1", projectId: "project-1", nodeId: "node-1", model: "embed-v1", dimensions: 3,
  });
  await assert.rejects(() => deleteOrganizationMemoryEmbedding(tx, { nodeId: "node-1" }), TypeError);
});
