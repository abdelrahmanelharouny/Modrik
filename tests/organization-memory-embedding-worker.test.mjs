import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizationMemoryEmbeddingClaimFilter,
  buildOrganizationMemoryEmbeddingLease,
  buildOrganizationMemoryEmbeddingRetry,
  buildOrganizationMemoryEmbeddingCompletion,
  classifyOrganizationMemoryEmbeddingWork,
} from "../src/lib/knowledge-graph/organization-memory-embedding-worker.mjs";

test("claim filter selects available pending jobs and expired processing leases only", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const filter = buildOrganizationMemoryEmbeddingClaimFilter(now);
  assert.deepEqual(filter.OR[0], { status: "pending", availableAt: { lte: now } });
  assert.deepEqual(filter.OR[1], { status: "processing", leaseExpiresAt: { lte: now } });
});

test("lease ownership is explicit and lease duration is bounded", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const lease = buildOrganizationMemoryEmbeddingLease({ workerId: "worker-a", now, leaseMs: 1 });
  assert.equal(lease.status, "processing");
  assert.equal(lease.lockedBy, "worker-a");
  assert.equal(lease.leaseExpiresAt.getTime() - now.getTime(), 15_000);
  assert.throws(() => buildOrganizationMemoryEmbeddingLease({ now }), /workerId/);
});

test("retry uses capped exponential backoff, clears lease and dead-letters exhausted work", () => {
  const now = new Date("2026-11-06T12:00:00.000Z");
  const retry = buildOrganizationMemoryEmbeddingRetry({ attempts: 3, now, baseDelayMs: 1000, error: "Bearer supersecret" });
  assert.equal(retry.status, "pending");
  assert.equal(retry.delayMs, 4000);
  assert.equal(retry.availableAt.getTime(), now.getTime() + 4000);
  assert.equal(retry.lockedAt, null);
  assert.doesNotMatch(retry.lastError, /supersecret/);
  assert.equal(buildOrganizationMemoryEmbeddingRetry({ attempts: 8, maxAttempts: 8, now }).status, "dead");
});

test("completion is compare-and-swap scoped to the worker lease owner", () => {
  const lockedAt = new Date("2026-11-06T12:00:00.000Z");
  const update = buildOrganizationMemoryEmbeddingCompletion({ jobId: "job-1", workerId: "worker-a", lockedAt });
  assert.deepEqual(update.where, { id: "job-1", status: "processing", lockedBy: "worker-a", lockedAt });
  assert.equal(update.data.status, "completed");
});

test("upserts are discarded when source content changed; delete tombstones survive source deletion", () => {
  assert.deepEqual(classifyOrganizationMemoryEmbeddingWork({ operation: "delete", nodeId: "n1" }), { action: "delete", nodeId: "n1" });
  assert.deepEqual(classifyOrganizationMemoryEmbeddingWork({
    operation: "upsert", nodeId: "n1", contentHash: "old", currentContentHash: "new", currentNodeStatus: "accepted",
  }), { action: "superseded", reason: "source_changed_or_not_accepted" });
  assert.deepEqual(classifyOrganizationMemoryEmbeddingWork({
    operation: "upsert", nodeId: "n1", contentHash: "same", currentContentHash: "same", currentNodeStatus: "accepted",
  }), { action: "embed", contentHash: "same" });
});
