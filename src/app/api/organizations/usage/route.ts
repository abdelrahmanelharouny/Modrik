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
  const [subscription, usage, events, members, projects, projectUsage, invoices] = await Promise.all([
    db.organizationSubscription.findUnique({ where: { organizationId: identity.organizationId } }),
    db.usageEvent.aggregate({ where: { organizationId: identity.organizationId, occurredAt: { gte: from } }, _sum: { quantity: true, estimatedCostUsd: true }, _count: { _all: true } }),
    db.usageEvent.findMany({ where: { organizationId: identity.organizationId }, orderBy: [{ occurredAt: "desc" },{id:"desc"}], take: 100, select: { id: true, projectId: true, source: true, eventType: true, quantity: true, unit: true, estimatedCostUsd: true, occurredAt: true } }),
    db.membership.count({ where: { organizationId: identity.organizationId, status: "active" } }),
    db.project.count({ where: { organizationId: identity.organizationId, status: { not: "archived" } } }),
    db.usageEvent.groupBy({ by: ["projectId"], where: { organizationId: identity.organizationId, occurredAt: { gte: from }, projectId: { not: null } }, _sum: { quantity: true, estimatedCostUsd: true }, _count: { _all: true }, orderBy: { _sum: { quantity: "desc" } }, take: 50 }),
    db.billingInvoice.findMany({ where: { organizationId: identity.organizationId }, orderBy: [{ issuedAt: "desc" },{ id: "desc" }], take: 50, select: { id: true, externalInvoiceId: true, invoiceNumber: true, status: true, currency: true, amountDue: true, amountPaid: true, hostedInvoiceUrl: true, invoicePdfUrl: true, issuedAt: true, paidAt: true } }),
  ]);
  return NextResponse.json({
    period: { from: from.toISOString(), to: new Date().toISOString(), timezone: "UTC" },
    subscription: subscription ?? { planKey: "free", status: "active", billingProvider: "manual" },
    totals: { quantity: usage._sum.quantity ?? 0, estimatedCostUsd: usage._sum.estimatedCostUsd ?? 0, events: usage._count._all },
    entitlements: evaluateOrganizationEntitlements({ planKey: subscription?.planKey ?? "free", monthlyTokens: usage._sum.quantity ?? 0, activeMembers: members, activeProjects: projects }),
    events,
    projectUsage: projectUsage.map(row => ({ projectId: row.projectId, quantity: row._sum.quantity ?? 0, estimatedCostUsd: row._sum.estimatedCostUsd ?? 0, events: row._count._all })),
    billing: { state: subscription?.billingProvider === "stripe" ? "stripe_connected" : "metering_only", provider: subscription?.billingProvider ?? "manual", invoices, message: subscription?.billingProvider === "stripe" ? "Stripe manages payment and tax; invoice records are synchronized from signed webhooks." : "Usage and estimated cost are recorded. No payment provider is active." },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
