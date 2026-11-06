import { replaceOrganizationMemorySearchDocument } from "./organization-memory-search-index.mjs";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

/** Rebuild derived search data from canonical nodes only; run each batch in a Serializable transaction. */
export async function repairOrganizationMemorySearchIndexBatch(tx, input = {}) {
  if (!tx?.project || !tx?.knowledgeNode || !tx?.organizationMemorySearchDocument ||
      !tx?.organizationMemorySearchPosting || !tx?.organizationMemorySearchIndexState) {
    throw new TypeError("A transaction client with project and organization-memory index models is required.");
  }
  if (typeof input.projectId !== "string" || !input.projectId.trim()) {
    throw new TypeError("A projectId is required for scoped index repair.");
  }
  const requested = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  const phase = input.phase ?? "nodes";
  if (phase !== "nodes" && phase !== "documents") throw new TypeError("Repair phase must be nodes or documents.");

  // Recheck lifecycle state inside every transaction; archived projects are never repaired.
  const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true, status: true } });
  if (!project || project.status === "archived") {
    return { projectId: input.projectId, status: "blocked", reason: project ? "project_archived" : "project_missing", done: true, processed: 0 };
  }

  if (phase === "nodes") {
    const nodes = await tx.knowledgeNode.findMany({
      where: { projectId: input.projectId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
      orderBy: { id: "asc" }, take: batchSize,
      select: { id: true, projectId: true, status: true, kind: true, label: true, description: true },
    });
    if (!Array.isArray(nodes)) throw new TypeError("KnowledgeNode adapter must return an array.");
    for (const node of nodes) {
      if (node.projectId !== input.projectId) throw new Error("Repair source escaped the requested project scope.");
      await replaceOrganizationMemorySearchDocument(tx, node);
    }
    const cursor = nodes.length ? nodes[nodes.length - 1].id : (input.cursor ?? null);
    const done = nodes.length < batchSize;
    return {
      projectId: input.projectId, status: "running", phase: done ? "documents" : "nodes",
      nextPhase: done ? "documents" : "nodes", cursor: done ? null : cursor,
      nextCursor: done ? null : cursor, done: false, processed: nodes.length,
      repairedNodes: nodes.length, batchSize,
    };
  }

  const documents = await tx.organizationMemorySearchDocument.findMany({
    where: { projectId: input.projectId, ...(input.cursor ? { id: { gt: input.cursor } } : {}) },
    orderBy: { id: "asc" }, take: batchSize,
    select: { id: true, nodeId: true, projectId: true },
  });
  if (!Array.isArray(documents)) throw new TypeError("Search-document adapter must return an array.");
  const sourceNodes = documents.length ? await tx.knowledgeNode.findMany({
    where: { projectId: input.projectId, id: { in: documents.map((document) => document.nodeId) } },
    select: { id: true },
  }) : [];
  const sourceIds = new Set(sourceNodes.map((node) => node.id));
  const orphanDocuments = documents.filter((document) => document.projectId === input.projectId && !sourceIds.has(document.nodeId));
  let removedOrphanDocuments = 0;
  let removedOrphanPostings = 0;
  for (const document of orphanDocuments) {
    const removedPostings = await tx.organizationMemorySearchPosting.deleteMany({ where: { documentId: document.id } });
    removedOrphanPostings += removedPostings.count;
    const deleted = await tx.organizationMemorySearchDocument.deleteMany({
      where: { id: document.id, projectId: input.projectId, nodeId: document.nodeId },
    });
    removedOrphanDocuments += deleted.count;
  }
  if (removedOrphanDocuments) {
    await tx.organizationMemorySearchIndexState.updateMany({
      where: { projectId: input.projectId },
      data: {
        reconciliationStatus: "pending", reconciliationPhase: "nodes",
        reconciliationCursorNodeId: null, reconciliationCursorDocumentId: null,
        reconciliationMismatchCount: 0, reconciliationNormalizerVersion: 0,
        reconciliationCompletedAt: null,
      },
    });
  }
  const cursor = documents.length ? documents[documents.length - 1].id : (input.cursor ?? null);
  const done = documents.length < batchSize;
  return {
    projectId: input.projectId, status: done ? "completed" : "running",
    phase: "documents", nextPhase: "documents", cursor: done ? null : cursor,
    nextCursor: done ? null : cursor, done, processed: documents.length,
    removedOrphanDocuments, removedOrphanPostings, batchSize,
  };
}
