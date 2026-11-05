import {
  ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
  replaceOrganizationMemorySearchDocument,
} from "./organization-memory-search-index.mjs";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

/** Run inside a serializable Prisma transaction; source writes and cursor commit atomically. */
export async function backfillOrganizationMemorySearchIndexBatch(tx, input = {}) {
  if (!tx?.organizationMemorySearchIndexState || !tx?.knowledgeNode) {
    throw new TypeError("A transaction client with index-state and knowledge-node models is required.");
  }
  if (typeof input.projectId !== "string" || !input.projectId.trim()) {
    throw new TypeError("A projectId is required for a scoped index backfill.");
  }
  const requested = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(requested) && requested > 0
    ? Math.min(requested, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  const state = await tx.organizationMemorySearchIndexState.upsert({
    where: { projectId: input.projectId },
    create: { projectId: input.projectId, normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION, status: "pending" },
    update: {},
  });
  if (state.status === "completed" && state.normalizerVersion === ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION) {
    return { projectId: input.projectId, status: "completed", done: true, scannedCount: state.scannedCount, indexedCount: state.indexedCount, cursorNodeId: state.cursorNodeId, batchSize, processed: 0 };
  }
  const resetVersion = state.normalizerVersion !== ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION;
  const cursorNodeId = resetVersion ? null : state.cursorNodeId;
  const rows = await tx.knowledgeNode.findMany({
    where: { projectId: input.projectId, ...(cursorNodeId ? { id: { gt: cursorNodeId } } : {}) },
    orderBy: { id: "asc" }, take: batchSize,
    select: { id: true, projectId: true, status: true, kind: true, label: true, description: true },
  });
  for (const node of rows) await replaceOrganizationMemorySearchDocument(tx, node);
  const nextCursor = rows.length ? rows[rows.length - 1].id : cursorNodeId;
  const done = rows.length < batchSize;
  const nextData = {
    cursorNodeId: nextCursor,
    scannedCount: (resetVersion ? 0 : state.scannedCount) + rows.length,
    indexedCount: (resetVersion ? 0 : state.indexedCount) + rows.length,
    normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    status: done ? "completed" : "running",
    lastError: null,
    ...(state.startedAt ? {} : { startedAt: new Date() }),
    completedAt: done ? new Date() : null,
  };
  const changed = await tx.organizationMemorySearchIndexState.updateMany({
    where: { projectId: input.projectId, cursorNodeId: state.cursorNodeId, normalizerVersion: state.normalizerVersion, status: resetVersion ? "completed" : { not: "completed" } },
    data: nextData,
  });
  if (changed.count !== 1) throw new Error("Index backfill cursor changed concurrently; retry the transaction.");
  return { projectId: input.projectId, status: nextData.status, done, scannedCount: nextData.scannedCount, indexedCount: nextData.indexedCount, cursorNodeId: nextCursor, batchSize, processed: rows.length, normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION };
}

/** A read-path rollout gate: every in-scope project must be fully indexed. */
export async function getOrganizationMemorySearchIndexReadiness(input = {}) {
  const projectIds = [...new Set(Array.isArray(input.projectIds)
    ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : [])];
  if (typeof input.findMany !== "function") throw new TypeError("A project-scoped index-state adapter is required.");
  if (!projectIds.length) return { ready: true, projectCount: 0, readyProjectCount: 0, missingProjectIds: [], staleProjectIds: [], incompleteProjectIds: [] };
  const states = await input.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, status: true, normalizerVersion: true },
  });
  if (!Array.isArray(states)) throw new TypeError("Index-state adapter must return an array.");
  const byProject = new Map(states.map((state) => [state.projectId, state]));
  const missingProjectIds = projectIds.filter((id) => !byProject.has(id));
  const staleProjectIds = projectIds.filter((id) => byProject.has(id) &&
    byProject.get(id).normalizerVersion !== ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION);
  const incompleteProjectIds = projectIds.filter((id) => byProject.has(id) &&
    byProject.get(id).normalizerVersion === ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION &&
    byProject.get(id).status !== "completed");
  const readyProjectCount = projectIds.length - missingProjectIds.length - staleProjectIds.length - incompleteProjectIds.length;
  return { ready: readyProjectCount === projectIds.length, projectCount: projectIds.length, readyProjectCount, missingProjectIds, staleProjectIds, incompleteProjectIds };
}
