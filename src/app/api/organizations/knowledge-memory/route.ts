import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { resolveOrganizationMemoryTransition, normalizeOrganizationMemoryReason } from "@/lib/knowledge-graph/organization-memory-governance.mjs";
import {
  buildOrganizationKnowledgeQuery,
  buildOrganizationKnowledgeCandidateQuery,
  summarizeOrganizationKnowledgeNode,
  buildOrganizationReviewQueueQuery,
  summarizeOrganizationReviewQueueNode,
  hasVerifiedOrganizationMemoryIdentity,
  buildOrganizationMemoryPage,
  buildOrganizationMemoryCursorWhere,
  createOrganizationMemoryCursor,
} from "@/lib/knowledge-graph/organization-memory.mjs";
import { rankOrganizationMemoryCandidates } from "@/lib/knowledge-graph/organization-memory-retrieval.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

function permissionContext(identity: { role: string }) {
  return { role: identity.role, status: "active", userStatus: "active", organizationStatus: "active" };
}

/**
 * GET /api/organizations/knowledge-memory
 * All scope is derived from the verified session. Client-supplied organization
 * and project IDs are intentionally ignored.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let identity;
  try {
    identity = await resolveIdentitySession(token);
  } catch {
    return errorResponse("Identity could not be verified", 503);
  }
  if (!identity) return errorResponse("Authentication required", 401);
  if (!hasVerifiedOrganizationMemoryIdentity(identity)) {
    return errorResponse("Verified organization scope is required", 403);
  }

  const permissions = permissionContext(identity);
  if (!hasOrganizationPermission(permissions, "organization:read")) {
    return errorResponse("Insufficient organization permission", 403);
  }

  const params = req.nextUrl.searchParams;
  const rawLimit = params.get("limit");
  if (rawLimit !== null && (
    !Number.isSafeInteger(Number(rawLimit)) ||
    Number(rawLimit) < 1 ||
    Number(rawLimit) > 1000
  )) {
    return errorResponse("limit must be an integer between 1 and 1000", 400);
  }
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  const kind = params.get("kind") ?? undefined;
  const search = params.get("q") ?? undefined;
  const cursor = params.get("cursor");
  if (cursor !== null && (!cursor.trim() || cursor.length > 512)) {
    return errorResponse("cursor must be a non-empty record cursor of at most 512 characters", 400);
  }
  const view = params.get("view") ?? "accepted";
  if (view !== "accepted" && view !== "review_queue") {
    return errorResponse("view must be accepted or review_queue", 400);
  }
  const canReview = hasOrganizationPermission(permissions, "requirements:review");
  const canApprove = hasOrganizationPermission(permissions, "requirements:approve");
  if (view === "review_queue" && !canReview && !canApprove) {
    return errorResponse("Review permission required", 403);
  }

  try {
    const projects = await db.project.findMany({
      where: { organizationId: identity.organizationId, status: { not: "archived" } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    const rankedSearch = view === "accepted" && typeof search === "string" && search.trim().length > 0;
    if (rankedSearch && cursor !== null) {
      return errorResponse("cursor pagination is not available for ranked BM25 search; refine the query instead", 400);
    }
    const query = rankedSearch
      ? buildOrganizationKnowledgeCandidateQuery({ projectIds, kind })
      : (view === "review_queue" ? buildOrganizationReviewQueueQuery : buildOrganizationKnowledgeQuery)({
          projectIds, kind, search, limit,
        });
    const capabilities = view === "review_queue" ? { canReview, canApprove } : undefined;
    if (query.take === 0) {
      return NextResponse.json({
        items: [], total: 0, scope: "organization", view,
        ...(capabilities ? { capabilities } : {}),
      }, { headers: noStore });
    }

    const page = rankedSearch ? null : buildOrganizationMemoryPage({ limit: query.take, cursor: cursor ?? undefined });
    let pageWhere = query.where;
    if (page?.cursor) {
      // Validate the anchor inside the exact authorized view/filter and reject
      // stale snapshots; pagination then uses an immutable timestamp boundary.
      const anchor = await db.knowledgeNode.findFirst({
        where: { ...query.where, id: page.cursor.id },
        select: { id: true, updatedAt: true },
      });
      if (!anchor || anchor.updatedAt.getTime() !== page.cursor.updatedAt.getTime()) {
        return errorResponse("Invalid or expired organization memory cursor", 400);
      }
      pageWhere = buildOrganizationMemoryCursorWhere(
        query.where, page, view === "review_queue" ? "asc" : "desc",
      );
    }
    const nodes = await db.knowledgeNode.findMany({
      where: pageWhere,
      ...(page ? { take: page.take } : { take: query.take }),
      orderBy: query.orderBy,
      include: { project: { select: { name: true } } },
    });
    const summarize = view === "review_queue"
      ? summarizeOrganizationReviewQueueNode
      : summarizeOrganizationKnowledgeNode;
    const responseLimit = Math.min(limit ?? 25, 100);
    const rankedNodes = rankedSearch
      ? rankOrganizationMemoryCandidates({
          projectIds,
          candidates: nodes,
          query: search,
          mode: "lexical",
          limit: responseLimit,
        })
      : nodes;
    const pageNodes = page ? rankedNodes.slice(0, page.limit) : rankedNodes;
    const items = pageNodes.map((node) => {
      const summary = summarize(node);
      return summary && rankedSearch
        ? { ...summary, retrieval: node.retrieval }
        : summary;
    }).filter(Boolean);
    return NextResponse.json({
      items,
      total: items.length,
      limit: rankedSearch ? responseLimit : (page?.limit ?? responseLimit),
      ...(page ? {
        pagination: {
          hasMore: nodes.length > page.limit,
          nextCursor: nodes.length > page.limit ? createOrganizationMemoryCursor(pageNodes.at(-1)) : null,
        },
      } : { pagination: { hasMore: false, nextCursor: null } }),
      ...(rankedSearch ? { candidateWindow: query.take, candidatesScanned: nodes.length, retrievalMode: "bm25" } : {}),
      scope: "organization",
      view,
      ...(capabilities ? { capabilities } : {}),
      filters: {
        kind: typeof kind === "string" && kind.length <= 40 ? kind : null,
        query: typeof search === "string" ? search.trim().slice(0, 120) : null,
      },
    }, { headers: noStore });
  } catch {
    return errorResponse("Organization knowledge is temporarily unavailable", 503);
  }
}

/**
 * PATCH /api/organizations/knowledge-memory
 * Governance actions are scoped by the verified organization and use a
 * compare-and-set status transition with an atomic decision-journal entry.
 */
export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let identity;
  try {
    identity = await resolveIdentitySession(token);
  } catch {
    return errorResponse("Identity could not be verified", 503);
  }
  if (!identity) return errorResponse("Authentication required", 401);
  if (!hasVerifiedOrganizationMemoryIdentity(identity)) {
    return errorResponse("Verified organization scope is required", 403);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Invalid governance payload", 400);
  }
  if (typeof body.nodeId !== "string" || !body.nodeId.trim() || body.nodeId.length > 128) {
    return errorResponse("nodeId is required", 400);
  }
  if (typeof body.action !== "string") return errorResponse("action is required", 400);
  if (body.reason !== undefined && typeof body.reason !== "string") {
    return errorResponse("reason must be a string", 400);
  }
  const reason = normalizeOrganizationMemoryReason(body.reason);

  try {
    const result = await db.$transaction(async (tx) => {
      const node = await tx.knowledgeNode.findFirst({
        where: {
          id: body.nodeId.trim(),
          project: {
            organizationId: identity.organizationId,
            status: { not: "archived" },
          },
        },
        select: { id: true, projectId: true, nodeRef: true, status: true },
      });
      if (!node) return { kind: "not_found" as const };

      const transition = resolveOrganizationMemoryTransition(body.action, node.status);
      if (!transition) return { kind: "invalid_transition" as const, status: node.status };

      if (!hasOrganizationPermission(permissionContext(identity), transition.permission)) {
        return { kind: "forbidden" as const };
      }

      const changed = await tx.knowledgeNode.updateMany({
        where: { id: node.id, projectId: node.projectId, status: transition.from },
        data: { status: transition.to },
      });
      if (changed.count !== 1) return { kind: "conflict" as const };

      await tx.decisionEntry.create({
        data: {
          projectId: node.projectId,
          stage: "ORG_MEMORY",
          actor: "human",
          action: "organization_memory_" + transition.action,
          detail: JSON.stringify({
            actorUserId: identity.userId, nodeId: node.id, nodeRef: node.nodeRef,
            from: transition.from, to: transition.to, reason,
          }),
        },
      });

      await tx.organizationAuditEvent.create({
        data: {
          organizationId: identity.organizationId,
          actorUserId: identity.userId,
          eventType: "knowledge_memory." + transition.action,
          resourceType: "knowledge_node",
          resourceId: node.id,
          projectId: node.projectId,
          summary: "Organization knowledge " + transition.action.replaceAll("_", " "),
          metadata: JSON.stringify({ nodeRef: node.nodeRef, from: transition.from, to: transition.to, reason }),
        },
      });

      const updated = await tx.knowledgeNode.findUnique({
        where: { id: node.id },
        select: {
          id: true, projectId: true, nodeRef: true, kind: true, label: true,
          description: true, status: true, confidence: true, updatedAt: true,
        },
      });
      return { kind: "updated" as const, node: updated };
    });

    if (result.kind === "not_found") return errorResponse("Knowledge node not found", 404);
    if (result.kind === "forbidden") return errorResponse("Insufficient permission for this governance action", 403);
    if (result.kind === "invalid_transition") {
      return NextResponse.json(
        { error: "Invalid knowledge lifecycle transition", currentStatus: result.status },
        { status: 409, headers: noStore },
      );
    }
    if (result.kind === "conflict") return errorResponse("Knowledge node changed during review; refresh and retry", 409);
    return NextResponse.json({ node: result.node }, { headers: noStore });
  } catch {
    return errorResponse("Knowledge governance is temporarily unavailable", 503);
  }
}
