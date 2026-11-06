import {
  buildOrganizationMemoryEmbeddingContent,
  validateOrganizationMemoryVector,
} from "./organization-memory-embeddings.mjs";

/** Persist only when both project ownership and the canonical accepted node are revalidated. */
export async function persistOrganizationMemoryEmbedding(tx, input = {}) {
  if (!tx?.project?.findFirst || !tx?.knowledgeNode?.findFirst ||
      !tx?.organizationMemoryEmbedding?.upsert) {
    throw new TypeError("A transaction client with project, knowledge-node and embedding models is required.");
  }
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const nodeId = typeof input.nodeId === "string" ? input.nodeId.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!organizationId || !projectId || !nodeId || !model) throw new TypeError("Tenant, project, node and model identity are required.");
  const dimensions = Number(input.dimensions);
  const vector = validateOrganizationMemoryVector(input.embedding, { model, dimensions });
  const project = await tx.project.findFirst({
    where: { id: projectId, organizationId, status: { not: "archived" } },
    select: { id: true, organizationId: true },
  });
  if (!project || project.organizationId !== organizationId) return { persisted: false, reason: "project_scope_mismatch" };
  const node = await tx.knowledgeNode.findFirst({
    where: { id: nodeId, projectId, status: "accepted" },
    select: { id: true, projectId: true, status: true, kind: true, label: true, description: true },
  });
  if (!node || node.projectId !== projectId || node.status !== "accepted") {
    return { persisted: false, reason: "source_node_not_accepted" };
  }
  const canonical = buildOrganizationMemoryEmbeddingContent(node);
  if (canonical.contentHash !== input.contentHash) {
    return { persisted: false, reason: "source_content_changed" };
  }
  const data = {
    organizationId,
    projectId,
    nodeId,
    model,
    dimensions: vector.dimensions,
    vector: JSON.stringify(vector.vector),
    norm: vector.norm,
    contentHash: canonical.contentHash,
    normalizerVersion: canonical.normalizerVersion,
    status: "ready",
    embeddedAt: input.embeddedAt instanceof Date ? input.embeddedAt : new Date(),
  };
  const record = await tx.organizationMemoryEmbedding.upsert({
    where: { nodeId_model_dimensions: { nodeId, model, dimensions: vector.dimensions } },
    create: data,
    update: {
      organizationId,
      projectId,
      vector: data.vector,
      norm: data.norm,
      contentHash: data.contentHash,
      normalizerVersion: data.normalizerVersion,
      status: "ready",
      embeddedAt: data.embeddedAt,
    },
  });
  return { persisted: true, record };
}

/** Tenant-scoped deletion; never delete by node ID alone. */
export async function deleteOrganizationMemoryEmbedding(tx, input = {}) {
  if (!tx?.organizationMemoryEmbedding?.deleteMany) {
    throw new TypeError("A transaction client with the embedding model is required.");
  }
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const nodeId = typeof input.nodeId === "string" ? input.nodeId.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const dimensions = Number(input.dimensions);
  if (!organizationId || !projectId || !nodeId || !model ||
      !Number.isSafeInteger(dimensions) || dimensions < 2) {
    throw new TypeError("A complete tenant-scoped embedding identity is required.");
  }
  const result = await tx.organizationMemoryEmbedding.deleteMany({
    where: { organizationId, projectId, nodeId, model, dimensions },
  });
  return { deleted: result.count };
}
