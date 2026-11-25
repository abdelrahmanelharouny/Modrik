import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findActiveProjectRetentionHold } from "@/lib/phase4/retention-db.mjs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      evidences: { orderBy: { createdAt: "asc" }, include: {
        revisions: { orderBy: { version: "desc" }, take: 10 },
        claims: { orderBy: { createdAt: "desc" }, include: {
          revision: { select: { id: true, version: true, contentHash: true } },
          requirementLinks: { include: { requirement: { select: { id: true, refId: true, text: true } } } },
        } },
      } },
      questions: { orderBy: { order: "asc" } },
      candidates: true,
      reqs: { orderBy: { order: "asc" }, include: { links: { select: { id: true, evidenceId: true, evidenceCode: true, note: true } } } },
      stories: { orderBy: { refId: "asc" } },
      conflicts: { include: { reqA: true, reqB: true } },
      // Preserve ordinary artifact content for existing project views, but never expose reviewer packets, coordinator keys, submitted ratings or separately consented ASR research text through the broad project reader.
      artifacts: {
        where: { kind: { notIn: ["planner_human_eval_packet", "planner_human_eval_key", "planner_human_eval_review", "agent_human_eval_review", "asr_human_correction"] } },
        orderBy: { createdAt: "desc" },
      },
      decisions: { orderBy: { createdAt: "desc" }, take: 200 },
      runs: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const { reqs, ...rest } = project;
  return NextResponse.json({ project: { ...rest, requirements: reqs } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { id: true, organizationId: true, stageStatus: true },
    });
    if (!project) return { kind: "missing" as const };
    if (["agent_running", "approving"].includes(project.stageStatus)) return { kind: "busy" as const };
    if (project.organizationId) {
      const hold = await findActiveProjectRetentionHold(tx, project.organizationId, id);
      if (hold) return { kind: "held" as const, holdId: hold.id, resourceType: hold.resourceType, resourceId: hold.resourceId };
    }
    await tx.project.delete({ where: { id } });
    return { kind: "deleted" as const };
  }, { isolationLevel: "Serializable" });
  if (result.kind === "missing") return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (result.kind === "busy") return NextResponse.json({ error: "Project cannot be deleted while a pipeline operation is running." }, { status: 409 });
  if (result.kind === "held") return NextResponse.json({ error: "Project contains a resource protected by an active retention hold.", code: "RETENTION_HOLD_ACTIVE", holdId: result.holdId, resourceType: result.resourceType, resourceId: result.resourceId }, { status: 409 });
  return NextResponse.json({ ok: true });
}
