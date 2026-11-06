import { createHash } from "node:crypto";
import { buildOrganizationMemoryEmbeddingWork } from "./organization-memory-embeddings.mjs";

/**
 * Enqueue in the same Prisma transaction as the KnowledgeNode mutation.
 * Disabled or unowned projects are deliberately a no-op; no provider call occurs here.
 */
export async function enqueueOrganizationMemoryEmbeddingWork(tx, input = {}) {
  if (!input.enabled || !input.organizationId) return { queued: false, reason: "embedding_queue_disabled_or_unowned" };
  if (!tx?.organizationMemoryEmbeddingJob?.upsert) throw new TypeError("A transaction client with the embedding outbox model is required.");
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const dimensions = Number(input.dimensions);
  if (!model || !Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > 8192) {
    return { queued: false, reason: "embedding_model_not_configured" };
  }
  const work = buildOrganizationMemoryEmbeddingWork({
    organizationId: input.organizationId,
    model,
    dimensions,
    node: input.node,
  });
  const operationHash = work.operation === "upsert"
    ? work.contentHash
    : createHash("sha256").update(JSON.stringify([
      "delete", work.organizationId, work.projectId, work.nodeId,
      input.node.updatedAt instanceof Date ? input.node.updatedAt.toISOString() : String(input.node.updatedAt ?? ""),
      model, dimensions,
    ])).digest("hex");
  const idempotencyKey = createHash("sha256").update(JSON.stringify([
    work.organizationId, work.projectId, work.nodeId, work.operation, operationHash, model, dimensions,
  ])).digest("hex");
  const data = {
    organizationId: work.organizationId,
    projectId: work.projectId,
    nodeId: work.nodeId,
    operation: work.operation,
    model,
    dimensions,
    contentHash: work.operation === "upsert" ? work.contentHash : "",
    idempotencyKey,
    status: "pending",
    attempts: 0,
    maxAttempts: 8,
    availableAt: new Date(),
    lockedAt: null,
    leaseExpiresAt: null,
    lockedBy: null,
    lastError: null,
  };
  await tx.organizationMemoryEmbeddingJob.upsert({
    where: { idempotencyKey },
    create: data,
    update: {
      status: "pending",
      attempts: 0,
      availableAt: data.availableAt,
      lockedAt: null,
      leaseExpiresAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
  return { queued: true, operation: work.operation, idempotencyKey };
}
