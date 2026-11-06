import {
  buildTenantScopedEmbeddingFilter,
  rankTenantScopedOrganizationMemoryEmbeddings,
  validateOrganizationMemoryVector,
} from "./organization-memory-embeddings.mjs";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;
const MAX_CANDIDATES = 50_000;

/** Exact cosine scan over rows prefiltered by verified tenant/project/model scope. */
export async function searchTenantScopedOrganizationMemoryEmbeddings(input = {}) {
  const organizationId = typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const projectIds = [...new Set(Array.isArray(input.projectIds) ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : [])];
  if (!organizationId) throw new TypeError("Verified organization scope is required.");
  if (!projectIds.length) return { rows: [], candidatesScanned: 0, pages: 0, retrievalMode: "tenant_scoped_exact_cosine" };
  if (typeof input.findEmbeddings !== "function" || typeof input.findNodes !== "function") throw new TypeError("Tenant-scoped database adapters are required.");
  const model = typeof input.model === "string" ? input.model.trim() : "";
  const dimensions = Number(input.dimensions);
  const queryEmbedding = validateOrganizationMemoryVector(input.queryEmbedding, { model, dimensions });
  const where = buildTenantScopedEmbeddingFilter({ organizationId, projectIds, model, dimensions });
  if (!where) return { rows: [], candidatesScanned: 0, pages: 0, retrievalMode: "tenant_scoped_exact_cosine" };
  const rawBatch = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  const rawLimit = Number(input.limit);
  const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 25;
  const startedAt = Date.now();
  let cursor = null, pages = 0, candidatesScanned = 0, top = [];
  while (true) {
    const batch = await input.findEmbeddings({
      where: cursor ? { ...where, id: { gt: cursor } } : where,
      take: batchSize, orderBy: { id: "asc" },
      select: { id: true, organizationId: true, projectId: true, nodeId: true, model: true, dimensions: true, vector: true, norm: true, contentHash: true, normalizerVersion: true, status: true },
    });
    if (!Array.isArray(batch)) throw new TypeError("Embedding store adapter must return an array.");
    pages += 1;
    if (batch.length && batch.some((row, index) => !row || typeof row.id !== "string" || (index > 0 && row.id <= batch[index - 1].id) || (cursor && row.id <= cursor))) throw new Error("Embedding store violated stable keyset ordering.");
    if (candidatesScanned + batch.length > MAX_CANDIDATES) throw new RangeError("Semantic candidate scan exceeded its configured safety ceiling.");
    candidatesScanned += batch.length;
    if (batch.length) {
      const nodeIds = [...new Set(batch.map((row) => row.nodeId).filter((id) => typeof id === "string"))];
      const nodes = await input.findNodes({
        where: { id: { in: nodeIds }, projectId: { in: projectIds }, status: "accepted", project: { organizationId, status: { not: "archived" } } },
        include: { project: { select: { name: true, organizationId: true } } },
      });
      if (!Array.isArray(nodes)) throw new TypeError("Knowledge-node adapter must return an array.");
      const candidates = nodes.filter((node) => node?.project?.organizationId === organizationId).map((node) => ({ ...node, organizationId }));
      const ranked = rankTenantScopedOrganizationMemoryEmbeddings({ organizationId, projectIds, model, dimensions, queryEmbedding, candidates, embeddingRecords: batch, limit });
      const merged = new Map([...top, ...ranked].map((row) => [row.id, row]));
      top = [...merged.values()].sort((a, b) => b.retrieval.score - a.retrieval.score || a.id.localeCompare(b.id)).slice(0, limit);
    }
    if (batch.length < batchSize) break;
    cursor = batch[batch.length - 1].id;
    if (pages > Math.ceil(MAX_CANDIDATES / batchSize) + 1) throw new RangeError("Semantic candidate scan exceeded its page safety ceiling.");
  }
  return { rows: top, candidatesScanned, pages, batchSize, retrievalMode: "tenant_scoped_exact_cosine", durationMs: Math.max(0, Date.now() - startedAt) };
}

/** Reciprocal-rank fusion over independently tenant-authorized ranked lists. */
export function fuseOrganizationMemoryRankings(input = {}) {
  const lists = Array.isArray(input.rankings) ? input.rankings : [];
  const projectIds = new Set(Array.isArray(input.projectIds) ? input.projectIds : []);
  const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 25;
  const candidates = new Map(), scores = new Map(), k = 60;
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const seen = new Set(); let rank = 0;
    for (const row of list) {
      if (!row || typeof row.id !== "string" || !projectIds.has(row.projectId) || row.status !== "accepted" || seen.has(row.id)) continue;
      seen.add(row.id); rank += 1; candidates.set(row.id, row);
      scores.set(row.id, (scores.get(row.id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id, score]) => ({
    ...candidates.get(id), retrieval: { mode: "hybrid_rrf", score: Number(score.toFixed(8)) },
  }));
}