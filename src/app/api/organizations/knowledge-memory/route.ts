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
  buildOrganizationMemoryArchiveQuery,
  summarizeOrganizationArchivedKnowledgeNode,
  hasVerifiedOrganizationMemoryIdentity,
  buildOrganizationMemoryPage,
  buildOrganizationMemoryCursorWhere,
  createOrganizationMemoryCursor,
} from "@/lib/knowledge-graph/organization-memory.mjs";
import { rankOrganizationMemoryCandidatesStream, rankOrganizationMemoryCandidatesIndexed, compareOrganizationMemoryRetrievalParity } from "@/lib/knowledge-graph/organization-memory-retrieval.mjs";
import { searchTenantScopedOrganizationMemoryEmbeddings, fuseOrganizationMemoryRankings } from "@/lib/knowledge-graph/organization-memory-semantic-search.mjs";
import { createOrganizationMemoryEmbeddingProvider } from "@/lib/knowledge-graph/organization-memory-embedding-provider.mjs";
import { getOrganizationMemorySearchIndexReadiness } from "@/lib/knowledge-graph/organization-memory-search-backfill.mjs";
import { replaceOrganizationMemorySearchDocument, ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION } from "@/lib/knowledge-graph/organization-memory-search-index.mjs";

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
    Number(rawLimit) > 100
  )) {
    return errorResponse("limit must be an integer between 1 and 100", 400);
  }
  const limit = rawLimit === null ? undefined : Number(rawLimit);
  const kind = params.get("kind") ?? undefined;
  const search = params.get("q")?.trim() || undefined;
  if (search && search.length > 120) {
    return errorResponse("q must be at most 120 characters", 400);
  }
  const cursor = params.get("cursor");
  if (cursor !== null && (!cursor.trim() || cursor.length > 512)) {
    return errorResponse("cursor must be a non-empty record cursor of at most 512 characters", 400);
  }
  const view = params.get("view") ?? "accepted";
  if (view !== "accepted" && view !== "review_queue" && view !== "archived") {
    return errorResponse("view must be accepted, review_queue or archived", 400);
  }
  const canReview = hasOrganizationPermission(permissions, "requirements:review");
  const canApprove = hasOrganizationPermission(permissions, "requirements:approve");
  if (view === "review_queue" && !canReview && !canApprove) {
    return errorResponse("Review permission required", 403);
  }
  if (view === "archived" && !canApprove) {
    return errorResponse("Knowledge archive access requires approval permission", 403);
  }

  try {
    const projects = await db.project.findMany({
      where: { organizationId: identity.organizationId, status: { not: "archived" } },
      select: { id: true },
    });
    const projectIds = projects.map((project) => project.id);
    const rankedSearch = view === "accepted" && typeof search === "string" && search.length > 0;
    const responseLimit = Math.min(limit ?? 25, 100);
    if (rankedSearch && cursor !== null) {
      return errorResponse("cursor pagination is not available for ranked BM25 search; refine the query instead", 400);
    }
    const query = rankedSearch
      ? buildOrganizationKnowledgeCandidateQuery({ projectIds, kind })
      : (view === "review_queue"
          ? buildOrganizationReviewQueueQuery
          : view === "archived"
            ? buildOrganizationMemoryArchiveQuery
            : buildOrganizationKnowledgeQuery)({ projectIds, kind, search, limit });
    const capabilities = { canReview, canApprove };
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
    // Network/provider work must finish before opening the serializable DB transaction.
    // The transaction below is reserved for tenant-scoped database retrieval only.
    let semanticContext: { model: string; dimensions: number; queryEmbedding: Awaited<ReturnType<Awaited<ReturnType<typeof createOrganizationMemoryEmbeddingProvider>>["embed"]>> } | null = null;
    let semanticPreflightFailed = false;
    if (rankedSearch && process.env.ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED === "true" && projectIds.length) {
      try {
        const provider = await createOrganizationMemoryEmbeddingProvider();
        const queryEmbedding = await provider.embed(search!);
        semanticContext = { model: provider.model, dimensions: provider.dimensions, queryEmbedding };
      } catch {
        semanticPreflightFailed = true;
      }
    }
    const scan = rankedSearch ? await db.$transaction(async (tx) => {
      const indexedEnabled = process.env.ORGANIZATION_MEMORY_INDEXED_READ_ENABLED === "true";
      const shadowEnabled = process.env.ORGANIZATION_MEMORY_INDEXED_SHADOW_ENABLED === "true";
      const runStreaming = () => rankOrganizationMemoryCandidatesStream({
        where: query.where,
        projectIds,
        query: search,
        limit: responseLimit,
        withProject: true,
        findMany: (args) => tx.knowledgeNode.findMany(args as Parameters<typeof tx.knowledgeNode.findMany>[0]),
      });
      const runHybrid = async <T extends { rows: Array<{ id: string; projectId: string; status: string }> }>(lexical: T) => {
        if (process.env.ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED !== "true" || !projectIds.length) return lexical;
        if (!semanticContext) {
          return semanticPreflightFailed
            ? { ...lexical, semanticFallbackReason: "semantic_unavailable_bm25_served" }
            : lexical;
        }
        try {
          const semantic = await searchTenantScopedOrganizationMemoryEmbeddings({
            organizationId: identity.organizationId, projectIds, model: semanticContext.model, dimensions: semanticContext.dimensions,
            queryEmbedding: semanticContext.queryEmbedding, limit: responseLimit,
            findEmbeddings: (args) => tx.organizationMemoryEmbedding.findMany(args as Parameters<typeof tx.organizationMemoryEmbedding.findMany>[0]),
            findNodes: (args) => tx.knowledgeNode.findMany(args as Parameters<typeof tx.knowledgeNode.findMany>[0]),
          });
          return {
            ...lexical,
            rows: fuseOrganizationMemoryRankings({ rankings: [lexical.rows, semantic.rows], projectIds, limit: responseLimit }),
            retrievalMode: "hybrid_bm25_semantic_rrf",
            semanticCandidatesScanned: semantic.candidatesScanned,
            semanticCandidatePages: semantic.pages,
            semanticDurationMs: semantic.durationMs,
          };
        } catch {
          return { ...lexical, semanticFallbackReason: "semantic_unavailable_bm25_served" };
        }
      };
      if (!indexedEnabled && !shadowEnabled) {
        return {
          ...(await runHybrid(await runStreaming())),
          indexReadiness: { checked: false, ready: false, projectCount: projectIds.length, readyProjectCount: 0 },
          indexedFallbackReason: "indexed_read_disabled",
        };
      }

      const readiness = await getOrganizationMemorySearchIndexReadiness({
        projectIds,
        findMany: (args) => tx.organizationMemorySearchIndexState.findMany(args as Parameters<typeof tx.organizationMemorySearchIndexState.findMany>[0]),
      });
      const readinessSummary = {
        checked: true, ready: readiness.ready, projectCount: readiness.projectCount,
        readyProjectCount: readiness.readyProjectCount,
      };
      if (!readiness.ready) {
        const fallbackReason =
          readiness.missingProjectIds.length ? "index_state_missing" :
          readiness.staleProjectIds.length ? "backfill_normalizer_stale" :
          readiness.incompleteProjectIds.length ? "backfill_incomplete" :
          readiness.reconciliationMismatchProjectIds.length ? "reconciliation_mismatch" :
          readiness.reconciliationNormalizerStaleProjectIds.length ? "reconciliation_normalizer_stale" :
          readiness.reconciliationFailedProjectIds.length ? "reconciliation_failed" :
          "reconciliation_incomplete";
        return {
          ...(await runHybrid(await runStreaming())),
          indexReadiness: readinessSummary,
          indexedFallbackReason: fallbackReason,
        };
      }

      const indexed = await rankOrganizationMemoryCandidatesIndexed({
        projectIds,
        query: search,
        limit: responseLimit,
        normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
        aggregateDocuments: (args) => tx.organizationMemorySearchDocument.aggregate(args as Parameters<typeof tx.organizationMemorySearchDocument.aggregate>[0]),
        findPostings: (args) => tx.organizationMemorySearchPosting.findMany(args as Parameters<typeof tx.organizationMemorySearchPosting.findMany>[0]),
        findCandidates: (args) => tx.knowledgeNode.findMany(args as Parameters<typeof tx.knowledgeNode.findMany>[0]),
      });
      const indexedWithSemantic = indexedEnabled ? await runHybrid(indexed) : indexed;
      if (shadowEnabled) {
        const streamingBase = await runStreaming();
        // When indexed reads are authoritative, the indexed hybrid result is
        // already computed above. Keep shadow parity lexical-only and avoid a
        // second paid embedding-provider request for the streaming baseline.
        const streaming = indexedEnabled ? streamingBase : await runHybrid(streamingBase);
        const parity = compareOrganizationMemoryRetrievalParity(streamingBase.rows, indexed.rows);
        return {
          ...(indexedEnabled ? indexedWithSemantic : streaming),
          shadowComparison: parity,
          indexedShadowPostingsScanned: indexed.postingsScanned,
          indexedShadowDurationMs: indexed.durationMs,
          indexReadiness: readinessSummary,
          indexedFallbackReason: indexedEnabled ? null : "shadow_mode_keeps_streaming_authoritative",
        };
      }
      return {
        ...indexedWithSemantic,
        indexReadiness: readinessSummary,
        indexedFallbackReason: null,
      };
    }, { isolationLevel: "Serializable" }) : null;
    const shadowMetrics = scan && "shadowComparison" in scan
      ? scan as typeof scan & {
          shadowComparison: ReturnType<typeof compareOrganizationMemoryRetrievalParity>;
          indexedShadowPostingsScanned: number;
          indexedShadowDurationMs: number;
        }
      : null;
    const nodes = rankedSearch ? scan!.rows : await db.knowledgeNode.findMany({
      where: pageWhere,
      ...(page ? { take: page.take } : { take: query.take }),
      orderBy: query.orderBy,
      include: { project: { select: { name: true } } },
    });
    const summarize = view === "review_queue"
      ? summarizeOrganizationReviewQueueNode
      : view === "archived"
        ? summarizeOrganizationArchivedKnowledgeNode
        : summarizeOrganizationKnowledgeNode;
    const rankedNodes = nodes;
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
          nextCursor: nodes.length > page.limit ? createOrganizationMemoryCursor(nodes[page.limit - 1]! as { id: string; updatedAt: Date }) : null,
        },
      } : { pagination: { hasMore: false, nextCursor: null } }),
      ...(rankedSearch ? {
        candidatesScanned: scan!.candidatesScanned,
        rankingCandidatesScanned: scan!.rankingCandidatesScanned ?? scan!.candidatesScanned,
        candidatePages: scan!.pages,
        candidateFirstPassPages: "firstPassPages" in scan! ? scan!.firstPassPages : null,
        candidateSecondPassPages: "secondPassPages" in scan! ? scan!.secondPassPages : null,
        candidatePasses: "passes" in scan! ? scan!.passes : 1,
        retrievalPostingsScanned: "postingsScanned" in scan! ? scan!.postingsScanned : null,
        candidateBatchSize: scan!.batchSize,
        retrievalDurationMs: scan!.durationMs,
        candidateWindowTruncated: false,
        retrievalMode: scan!.retrievalMode ?? "streaming_bm25_keyset",
        retrievalSnapshotAt: scan!.snapshotAt,
        indexedReadiness: scan!.indexReadiness,
        indexedFallbackReason: scan!.indexedFallbackReason,
        semanticFallbackReason: "semanticFallbackReason" in scan! ? scan!.semanticFallbackReason : null,
        semanticCandidatesScanned: "semanticCandidatesScanned" in scan! ? scan!.semanticCandidatesScanned : null,
        semanticCandidatePages: "semanticCandidatePages" in scan! ? scan!.semanticCandidatePages : null,
        semanticDurationMs: "semanticDurationMs" in scan! ? scan!.semanticDurationMs : null,
        ...(shadowMetrics ? {
          indexedShadowComparison: shadowMetrics.shadowComparison,
          indexedShadowPostingsScanned: shadowMetrics.indexedShadowPostingsScanned,
          indexedShadowDurationMs: shadowMetrics.indexedShadowDurationMs,
        } : {}),
      } : {}),
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
          origin: true, owner: true,
        },
      });
      if (!updated) throw new Error("Updated knowledge node could not be reloaded.");
      await replaceOrganizationMemorySearchDocument(tx, updated);
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
