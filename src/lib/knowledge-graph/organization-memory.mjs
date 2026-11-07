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
 * Build an uncapped, accepted-only candidate filter for multilingual BM25.
 * The server supplies only project IDs derived from the verified organization.
 * Search is applied by the streaming ranker after Arabic normalization, not
 * by raw database substring matching.
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
  return { where, take: null, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] };
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
 * Encode a timestamp snapshot and stable record ID into an opaque cursor.
 * This is not an authorization token; tenant and filter scope are re-applied.
 */
export function createOrganizationMemoryCursor(node) {
  if (!node || typeof node.id !== "string" || !node.id ||
      !(node.updatedAt instanceof Date) || Number.isNaN(node.updatedAt.getTime())) {
    throw new TypeError("Organization memory cursor anchor is invalid.");
  }
  return Buffer.from(JSON.stringify({
    v: 1, id: node.id, updatedAt: node.updatedAt.toISOString(),
  })).toString("base64url");
}

export function buildOrganizationMemoryPage(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization memory pagination input must be an object.");
  }
  const requestedLimit = Number(input.limit);
  const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  const token = typeof input.cursor === "string" ? input.cursor.trim() : "";
  if (token.length > 512) throw new TypeError("Organization memory cursor is invalid.");
  if (!token) return { limit, take: limit + 1 };
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const timestamp = new Date(decoded.updatedAt);
    if (decoded.v !== 1 || typeof decoded.id !== "string" || !decoded.id ||
        decoded.id.length > 128 || !Number.isFinite(timestamp.getTime()) ||
        timestamp.toISOString() !== decoded.updatedAt) throw new Error("invalid cursor");
    return { limit, take: limit + 1, cursor: { id: decoded.id, updatedAt: timestamp } };
  } catch {
    throw new TypeError("Organization memory cursor is invalid.");
  }
}

/** Build a deterministic (updatedAt, id) keyset boundary, preserving search filters. */
export function buildOrganizationMemoryCursorWhere(where, page, direction = "desc") {
  if (!where || typeof where !== "object" || !page || !page.cursor ||
      !(page.cursor.updatedAt instanceof Date) || typeof page.cursor.id !== "string") {
    throw new TypeError("Organization memory cursor boundary is invalid.");
  }
  if (direction !== "asc" && direction !== "desc") {
    throw new TypeError("Organization memory cursor direction is invalid.");
  }
  const timestampOperator = direction === "asc" ? "gt" : "lt";
  return {
    ...where,
    AND: [
      ...(Array.isArray(where.AND) ? where.AND : []),
      { OR: [
        { updatedAt: { [timestampOperator]: page.cursor.updatedAt } },
        { updatedAt: page.cursor.updatedAt, id: { gt: page.cursor.id } },
      ] },
    ],
  };
}


/** Build a bounded, approver-only archive view. projectIds must come from verified membership. */
export function buildOrganizationMemoryArchiveQuery(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization memory archive query must be an object.");
  }
  const projectIds = Array.isArray(input.projectIds)
    ? [...new Set(input.projectIds.filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim()))]
    : [];
  if (projectIds.length === 0) {
    return { where: { id: "__no_authorized_projects__" }, take: 0, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] };
  }
  const requestedLimit = Number(input.limit);
  const take = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const where = { projectId: { in: projectIds }, status: "archived" };
  if (typeof input.kind === "string" && ALLOWED_KINDS.has(input.kind)) where.kind = input.kind;
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 120) : "";
  if (search) where.OR = [{ label: { contains: search } }, { description: { contains: search } }];
  return { where, take, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] };
}

/** Archive metadata is visible only through the separately authorized approver view. */
export function summarizeOrganizationArchivedKnowledgeNode(node) {
  if (!node || typeof node !== "object" || node.status !== "archived") return null;
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
