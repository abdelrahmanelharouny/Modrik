/** A verified identity must carry explicit, non-empty organization and actor scope. */
export function hasVerifiedOrganizationMemoryIdentity(identity) {
  return Boolean(
    identity && typeof identity === "object" && !Array.isArray(identity) &&
    typeof identity.organizationId === "string" && identity.organizationId.trim().length > 0 &&
    typeof identity.userId === "string" && identity.userId.trim().length > 0 &&
    typeof identity.role === "string" && identity.role.length > 0
  );
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_KINDS = new Set([
  "stakeholder", "goal", "assumption", "constraint", "decision",
  "risk", "metric", "system", "domain_concept", "process", "policy",
]);

/**
 * Build a fail-closed Prisma filter for cross-project organizational knowledge.
 * projectIds MUST be derived by the server from the caller's verified membership.
 */
export function buildOrganizationKnowledgeQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization knowledge query must be an object.");
  }

  const projectIds = Array.isArray(input.projectIds)
    ? [...new Set(input.projectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];
  if (projectIds.length === 0) {
    return { where: { id: "__no_authorized_projects__" }, take: 0, orderBy: [{ updatedAt: "desc" }] };
  }

  const requestedLimit = Number(input.limit);
  const take = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const where = { projectId: { in: projectIds }, status: "accepted" };

  if (typeof input.kind === "string" && ALLOWED_KINDS.has(input.kind)) where.kind = input.kind;
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 120) : "";
  if (search) where.OR = [
    { label: { contains: search } },
    { description: { contains: search } },
  ];

  return { where, take, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] };
}


/**
 * Build a bounded candidate window for multilingual BM25 ranking.
 * The server supplies only project IDs derived from the verified organization.
 * Search is intentionally applied in-memory after fetching this capped set,
 * so Arabic normalization is not defeated by raw database substring matching.
 */
export function buildOrganizationKnowledgeCandidateQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization knowledge candidate query must be an object.");
  }
  const projectIds = Array.isArray(input.projectIds)
    ? [...new Set(input.projectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];
  if (projectIds.length === 0) {
    return { where: { id: "__no_authorized_projects__" }, take: 0, orderBy: [{ updatedAt: "desc" }] };
  }
  const where = { projectId: { in: projectIds }, status: "accepted" };
  if (typeof input.kind === "string" && ALLOWED_KINDS.has(input.kind)) where.kind = input.kind;
  return { where, take: 1000, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] };
}

/**
 * Build a bounded review-queue filter. The caller must first authorize
 * requirements:review or requirements:approve and derive projectIds from
 * the verified organization session.
 */
export function buildOrganizationReviewQueueQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization review query must be an object.");
  }
  const projectIds = Array.isArray(input.projectIds)
    ? [...new Set(input.projectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];
  if (projectIds.length === 0) {
    return { where: { id: "__no_authorized_projects__" }, take: 0, orderBy: [{ updatedAt: "desc" }] };
  }
  const requestedLimit = Number(input.limit);
  const take = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const where = { projectId: { in: projectIds }, status: "in_review" };
  if (typeof input.kind === "string" && ALLOWED_KINDS.has(input.kind)) where.kind = input.kind;
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 120) : "";
  if (search) where.OR = [
    { label: { contains: search } },
    { description: { contains: search } },
  ];
  return { where, take, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] };
}

export function summarizeOrganizationReviewQueueNode(node) {
  if (!node || typeof node !== "object" || node.status !== "in_review") return null;
  if (typeof node.id !== "string" || typeof node.projectId !== "string" ||
      typeof node.nodeRef !== "string" || typeof node.kind !== "string" ||
      typeof node.label !== "string") return null;
  return {
    id: node.id,
    projectId: node.projectId,
    projectName: typeof node.project?.name === "string" ? node.project.name : null,
    nodeRef: node.nodeRef,
    kind: node.kind,
    label: node.label,
    description: typeof node.description === "string" ? node.description.slice(0, 1200) : "",
    confidence: Number.isFinite(node.confidence) ? Math.max(0, Math.min(1, node.confidence)) : null,
    owner: typeof node.owner === "string" ? node.owner.slice(0, 160) : null,
    origin: typeof node.origin === "string" ? node.origin : "unknown",
    updatedAt: node.updatedAt ?? null,
  };
}

export function summarizeOrganizationKnowledgeNode(node) {
  if (!node || typeof node !== "object" || node.status !== "accepted") return null;
  if (typeof node.id !== "string" || typeof node.projectId !== "string" ||
      typeof node.nodeRef !== "string" || typeof node.kind !== "string" ||
      typeof node.label !== "string") return null;
  return {
    id: node.id,
    projectId: node.projectId,
    projectName: typeof node.project?.name === "string" ? node.project.name : null,
    nodeRef: node.nodeRef,
    kind: node.kind,
    label: node.label,
    description: typeof node.description === "string" ? node.description.slice(0, 1200) : "",
    confidence: Number.isFinite(node.confidence) ? Math.max(0, Math.min(1, node.confidence)) : null,
    updatedAt: node.updatedAt ?? null,
  };
}


/**
 * Build Prisma keyset-pagination arguments for a stable updatedAt/id ordering.
 * The cursor is an opaque record ID; authorization remains in the query's
 * projectId/status predicate and is never derived from the cursor itself.
 */
export function buildOrganizationMemoryPage(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization memory pagination input must be an object.");
  }
  const requestedLimit = Number(input.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const cursor = typeof input.cursor === "string" ? input.cursor.trim() : "";
  if (cursor.length > 128) throw new TypeError("Organization memory cursor is invalid.");
  return {
    limit,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}
