import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { evaluateOrganizationEntitlements } from "@/lib/phase4/plans.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const stages = ["ELICITATION","PROBLEM_SELECTION","EXTRACTION","AMBIGUITY","STORIES","CONFLICTS"];

export async function GET(req: NextRequest) {
  const identity = await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!hasOrganizationPermission({ role: identity.role, status: "active", userStatus: "active", organizationStatus: "active" }, "organization:read")) {
    return NextResponse.json({ error: "Organization access required" }, { status: 403, headers: noStore });
  }
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: "limit must be between 1 and 100" }, { status: 400, headers: noStore });
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  const where = { organizationId: identity.organizationId, status: { not: "archived" }, ...(q ? { name: { contains: q } } : {}) };
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0,0,0,0);
  const [projects, totalProjects, activeProjects, completedProjects, deadJobs, pendingFindings, subscription, monthlyUsage, activeMembers, projectUsage] = await Promise.all([
    db.project.findMany({
      where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: limit,
      select: {
        id: true, name: true, status: true, currentStage: true, stageStatus: true, createdAt: true, updatedAt: true,
        _count: { select: { evidences: true, reqs: true, stories: true, conflicts: true, stakeholders: true, runs: true, baselineSnapshots: true } },
        agentJobs: { where: { status: "dead" }, select: { id: true }, take: 10 },
      },
    }),
    db.project.count({ where }),
    db.project.count({ where: { ...where, status: "active" } }),
    db.project.count({ where: { ...where, status: "complete" } }),
    db.agentJob.count({ where: { project: { organizationId: identity.organizationId }, status: "dead" } }),
    db.changeImpactFinding.count({ where: { project: { organizationId: identity.organizationId }, status: "pending" } }),
    db.organizationSubscription.findUnique({ where: { organizationId: identity.organizationId }, select: { planKey: true, status: true, currentPeriodEnd: true } }),
    db.usageEvent.aggregate({ where: { organizationId: identity.organizationId, occurredAt: { gte: monthStart } }, _sum: { quantity: true, estimatedCostUsd: true }, _count: { _all: true } }),
    db.membership.count({ where: { organizationId: identity.organizationId, status: "active", user: { status: "active" } } }),
    db.usageEvent.groupBy({ by: ["projectId"], where: { organizationId: identity.organizationId, occurredAt: { gte: monthStart }, projectId: { not: null } }, _sum: { quantity: true, estimatedCostUsd: true }, _count: { _all: true }, orderBy: { _sum: { quantity: "desc" } }, take: 50 }),
  ]);
  const entitlements = evaluateOrganizationEntitlements({ planKey: subscription?.planKey ?? "free", monthlyTokens: monthlyUsage._sum.quantity ?? 0, activeMembers, activeProjects: totalProjects });
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: { totalProjects, activeProjects, completedProjects, deadJobs, pendingFindings, activeMembers },
    usage: { monthlyTokens: monthlyUsage._sum.quantity ?? 0, estimatedCostUsd: monthlyUsage._sum.estimatedCostUsd ?? 0, events: monthlyUsage._count._all, projectUsage: projectUsage.map(row => ({ projectId: row.projectId, quantity: row._sum.quantity ?? 0, estimatedCostUsd: row._sum.estimatedCostUsd ?? 0, events: row._count._all })) },
    subscription: subscription ?? { planKey: "free", status: "active", currentPeriodEnd: null },
    entitlements,
    projects: projects.map(p => ({
      ...p,
      progress: p.status === "complete" ? 100 : Math.round((Math.max(0, stages.indexOf(p.currentStage)) / stages.length) * 100),
      deadJobs: p.agentJobs.length,
      agentJobs: undefined,
    })),
    pagination: { limit, returned: projects.length, total: totalProjects, hasMore: projects.length === limit && totalProjects > projects.length },
    semantics: { usageCost: "estimated", entitlementEnforcement: entitlements.enforcement },
  }, { headers: noStore });
}
