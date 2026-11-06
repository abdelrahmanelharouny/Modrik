import test from "node:test";
import assert from "node:assert/strict";
import { enqueueOrganizationMemoryEmbeddingWork } from "../src/lib/knowledge-graph/organization-memory-embedding-outbox.mjs";

const node = {
  id: "node-1", projectId: "project-1", status: "accepted",
  kind: "decision", label: "Retention", description: "Seven years",
  updatedAt: new Date("2026-11-06T12:00:00.000Z"),
};

function fakeTx() {
  const calls = [];
  return {
    calls,
    organizationMemoryEmbeddingJob: {
      async upsert(args) { calls.push(args); return { id: "job-1" }; },
    },
  };
}

test("outbox is fail-closed when disabled or project has no organization", async () => {
  const tx = fakeTx();
  assert.deepEqual(await enqueueOrganizationMemoryEmbeddingWork(tx, {
    enabled: false, organizationId: "org-1", model: "embed-v1", dimensions: 3, node,
  }), { queued: false, reason: "embedding_queue_disabled_or_unowned" });
  assert.deepEqual(await enqueueOrganizationMemoryEmbeddingWork(tx, {
    enabled: true, organizationId: null, model: "embed-v1", dimensions: 3, node,
  }), { queued: false, reason: "embedding_queue_disabled_or_unowned" });
  assert.equal(tx.calls.length, 0);
});

test("accepted node mutation enqueues an idempotent upsert inside caller transaction", async () => {
  const tx = fakeTx();
  const input = { enabled: true, organizationId: "org-1", model: "embed-v1", dimensions: 3, node };
  const first = await enqueueOrganizationMemoryEmbeddingWork(tx, input);
  const second = await enqueueOrganizationMemoryEmbeddingWork(tx, input);
  assert.equal(first.operation, "upsert");
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(tx.calls.length, 2);
  assert.equal(tx.calls[0].create.organizationId, "org-1");
  assert.equal(tx.calls[0].create.projectId, "project-1");
  assert.equal(tx.calls[0].create.contentHash.length, 64);
  assert.equal(tx.calls[0].create.status, "pending");
  assert.equal(tx.calls[0].where.idempotencyKey, first.idempotencyKey);
});

test("non-accepted transitions enqueue durable delete tombstones", async () => {
  const tx = fakeTx();
  const result = await enqueueOrganizationMemoryEmbeddingWork(tx, {
    enabled: true, organizationId: "org-1", model: "embed-v1", dimensions: 3,
    node: { ...node, status: "archived" },
  });
  assert.equal(result.operation, "delete");
  assert.equal(tx.calls[0].create.operation, "delete");
  assert.equal(tx.calls[0].create.contentHash, "");
  assert.equal(tx.calls[0].create.idempotencyKey.length, 64);
});

test("invalid model configuration skips enqueue without corrupting source transaction", async () => {
  const tx = fakeTx();
  const result = await enqueueOrganizationMemoryEmbeddingWork(tx, {
    enabled: true, organizationId: "org-1", model: "", dimensions: 3, node,
  });
  assert.deepEqual(result, { queued: false, reason: "embedding_model_not_configured" });
  assert.equal(tx.calls.length, 0);
});
