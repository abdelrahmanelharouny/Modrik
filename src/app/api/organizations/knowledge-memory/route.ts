import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import {
  buildOrganizationKnowledgeQuery,
  summarizeOrganizationKnowledgeNode,
} from "@/lib/knowledge-graph/organization-memory.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
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

  // resolveIdentitySession re-reads the session, user, membership and organization
  // from the database; this permission check uses that verified membership role.
  if (!hasOrganizationPermission({
    role: identity.role,
    status: "active",
    userStatus: "active",
    organizationStatus: "active",
  }, "organization:read")) {
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

  try {
    // This is the only project scope used below. Never accept projectIds from
    // query parameters or request bodies for organization-wide retrieval.
    const projects = await db.project.findMany({
      where: { organizationId: identity.organizationId, status: { not: "archived" } },
      select: { id: true },
    });
    const query = buildOrganizationKnowledgeQuery({
      projectIds: projects.map((project) => project.id),
      kind,
      search,
      limit,
    });
    if (query.take === 0) {
      return NextResponse.json({ items: [], total: 0, scope: "organization" }, { headers: noStore });
    }

    const nodes = await db.knowledgeNode.findMany({
      where: query.where,
      take: query.take,
      orderBy: query.orderBy,
      include: { project: { select: { name: true } } },
    });
    const items = nodes.map(summarizeOrganizationKnowledgeNode).filter(Boolean);
    return NextResponse.json({
      items,
      total: items.length,
      limit: query.take,
      scope: "organization",
      filters: {
        kind: typeof kind === "string" && kind.length <= 40 ? kind : null,
        query: typeof search === "string" ? search.trim().slice(0, 120) : null,
      },
    }, { headers: noStore });
  } catch {
    return errorResponse("Organization knowledge is temporarily unavailable", 503);
  }
}
