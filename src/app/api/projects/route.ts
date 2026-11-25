import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveOrganizationPlan } from "@/lib/phase4/plans.mjs";

export async function GET(req: NextRequest) {
  const organizationId = req.headers.get("x-modrik-organization-id");
  const projects = await db.project.findMany({
    ...(organizationId ? { where: { organizationId } } : {}),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      brief: true,
      status: true,
      currentStage: true,
      stageStatus: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { evidences: true, reqs: true, stories: true } },
    },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const brief = String(body.brief ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }
  const organizationId = req.headers.get("x-modrik-organization-id");
  const userId = req.headers.get("x-modrik-user-id");
  let project;
  if (organizationId && userId) {
    try {
      project = await db.$transaction(async (tx) => {
        const subscription = await tx.organizationSubscription.findUnique({ where: { organizationId }, select: { planKey: true, status: true } });
        if (subscription) {
          if (["canceled", "suspended"].includes(subscription.status)) throw new Error("SUBSCRIPTION_INACTIVE");
          const plan = resolveOrganizationPlan(subscription.planKey);
          const current = await tx.project.count({ where: { organizationId, status: { not: "archived" } } });
          if (current >= plan.projectLimit) throw new Error("PLAN_LIMIT_PROJECTS");
        }
        const created = await tx.project.create({ data: {
          name: name.slice(0, 120), brief: brief.slice(0, 6000), organizationId, createdByUserId: userId,
        } });
        await tx.organizationAuditEvent.create({ data: {
          organizationId, actorUserId: userId, eventType: "project.created", resourceType: "project",
          resourceId: created.id, projectId: created.id, summary: "Project created",
          metadata: JSON.stringify({ name: created.name }),
        } });
        return created;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof Error && error.message === "PLAN_LIMIT_PROJECTS") {
        return NextResponse.json({ error: "This organization's project limit has been reached. Upgrade the plan to create more projects.", code: "PLAN_LIMIT_PROJECTS" }, { status: 402 });
      }
      if (error instanceof Error && error.message === "SUBSCRIPTION_INACTIVE") {
        return NextResponse.json({ error: "The organization subscription is not active.", code: "SUBSCRIPTION_INACTIVE" }, { status: 402 });
      }
      throw error;
    }
  } else {
    project = await db.project.create({ data: { name: name.slice(0, 120), brief: brief.slice(0, 6000) } });
  }
  return NextResponse.json({ project }, { status: 201 });
}
