import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { evaluateOrganizationEntitlements } from "@/lib/phase4/plans.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const identity = await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!hasOrganizationPermission({ role: identity.role, status: "active", userStatus: "active", organizationStatus: "active" }, "organization:read")) {
    return NextResponse.json({ error: "Organization access required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const from = new Date(); from.setUTCDate(1); from.setUTCHours(0,0,0,0);
  const [subscription, usage, events, members, projects] = await Promise.all([
    db.organizationSubscription.findUnique({ where: { organizationId: identity.organizationId } }),
    db.usageEvent.aggregate({ where: { organizationId: identity.organizationId, occurredAt: { gte: from } }, _sum: { quantity: true, estimatedCostUsd: true }, _count: { _all: true } }),
    db.usageEvent.findMany({ where: { organizationId: identity.organizationId }, orderBy: [{ occurredAt: "desc" },{id:"desc"}], take: 100, select: { id: true, projectId: true, source: true, eventType: true, quantity: true, unit: true, estimatedCostUsd: true, occurredAt: true } }),
    db.membership.count({ where: { organizationId: identity.organizationId, status: "active" } }),
    db.project.count({ where: { organizationId: identity.organizationId } }),
  ]);
  return NextResponse.json({
    period: { from: from.toISOString(), to: new Date().toISOString(), timezone: "UTC" },
    subscription: subscription ?? { planKey: "free", status: "active", billingProvider: "manual" },
    totals: { quantity: usage._sum.quantity ?? 0, estimatedCostUsd: usage._sum.estimatedCostUsd ?? 0, events: usage._count._all },
    entitlements: evaluateOrganizationEntitlements({ planKey: subscription?.planKey ?? "free", monthlyTokens: usage._sum.quantity ?? 0, activeMembers: members, activeProjects: projects }),
    events,
    billing: { state: "metering_only", message: "Usage and estimated cost are recorded. No payment provider, invoice or charge is active." },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
