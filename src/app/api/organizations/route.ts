import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import { consumeRateLimit } from "@/lib/security/rate-limit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers: noStore }); }
function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export async function GET(req: NextRequest) {
  const identity = await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return fail("Authentication required", 401);
  const memberships = await db.membership.findMany({
    where: { userId: identity.userId, status: "active", organization: { status: "active" } },
    orderBy: { organization: { name: "asc" } },
    select: { id: true, role: true, organization: { select: { id: true, name: true, slug: true, status: true, createdAt: true } } },
  });
  return NextResponse.json({
    organizations: memberships.map(m => ({ ...m.organization, membershipId: m.id, role: m.role, active: m.organization.id === identity.organizationId })),
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) return fail("Cross-origin organization creation rejected", 403);
  const identity = await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return fail("Authentication required", 401);
  if (!hasOrganizationPermission({ role: identity.role, status: "active", userStatus: "active", organizationStatus: "active" }, "organizations:create")) {
    return fail("Organization creation is not permitted", 403);
  }
  const limit = await consumeRateLimit({ scope: "organization:create:user", identifier: identity.userId, limit: 5, windowMs: 24 * 60 * 60 * 1000 });
  if (limit.backend === "unavailable") return fail("Shared organization creation protection is unavailable", 503);
  if (!limit.allowed) return NextResponse.json({ error: "Organization creation is temporarily rate-limited" }, { status: 429, headers: { ...noStore, "Retry-After": String(limit.retryAfterSeconds) } });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Invalid request body", 400);
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 100) return fail("Organization name must contain 1–100 characters", 400);
  const suppliedSlug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const baseSlug = suppliedSlug || slugify(name);
  if (suppliedSlug && !/^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])$/.test(suppliedSlug)) return fail("Slug must be 3–62 lowercase letters, digits or hyphens", 400);
  const slug = suppliedSlug || ((baseSlug || "workspace") + "-" + randomBytes(3).toString("hex"));
  const now = new Date();
  try {
    const organization = await db.$transaction(async tx => {
      const created = await tx.organization.create({ data: { name, slug, status: "active" } });
      await tx.membership.create({ data: {
        userId: identity.userId, organizationId: created.id, role: "owner", status: "active", activatedAt: now,
      } });
      await tx.organizationSubscription.create({ data: { organizationId: created.id, planKey: "free", status: "active", billingProvider: "manual" } });
      await tx.organizationPolicy.create({ data: {
        organizationId: created.id, dataRetentionDays: 365, evidenceRetentionDays: 365, auditRetentionDays: 2555,
        aiProcessingAllowed: true, permittedAiProviders: JSON.stringify(["zai"]), defaultLocale: "en", updatedByUserId: identity.userId,
      } });
      await tx.organizationAuditEvent.create({ data: {
        organizationId: created.id, actorUserId: identity.userId, eventType: "organization.created",
        resourceType: "organization", resourceId: created.id, summary: "Organization workspace created",
        metadata: JSON.stringify({ planKey: "free", createdBy: identity.userId }),
      } });
      return created;
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ organization, membershipRole: "owner", requiresOrganizationSwitch: true }, { status: 201, headers: noStore });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return fail("That organization slug is already in use", 409);
    return fail("Organization could not be created", 500);
  }
}
