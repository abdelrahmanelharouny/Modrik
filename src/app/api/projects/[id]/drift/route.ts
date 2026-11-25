import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueChangeImpactJob } from "@/lib/pipeline/change-impact";
import { resolveChangeImpactTriage } from "@/lib/pipeline/change-impact.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";

type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };
function parsePayload(payload: string) {
  try { const value = JSON.parse(payload); return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404, headers: noStore });
  const jobs = await db.agentJob.findMany({
    where: { projectId, jobKind: "change_impact" },
    orderBy: { createdAt: "desc" }, take: 40,
    include: {
      pipelineRun: { select: { status: true, log: true, createdAt: true, completedAt: true } },
      changeImpactFindings: {
        orderBy: { createdAt: "asc" },
        include: { requirement: { select: { refId: true, text: true, status: true, priority: true, verifyStatus: true, driftStatus: true } } },
      },
    },
  });
  const syncMapIds = jobs.map((job) => {
    const payload = parsePayload(job.payload); return typeof payload.syncMapId === "string" ? payload.syncMapId : "";
  }).filter(Boolean);
  const maps = syncMapIds.length ? await db.syncMap.findMany({
    where: { projectId, id: { in: syncMapIds } },
    select: { id: true, kind: true, direction: true, externalKey: true, externalUrl: true, title: true, syncedAt: true },
  }) : [];
  const mapById = new Map(maps.map((map) => [map.id, map]));
  return NextResponse.json({
    jobs: jobs.map((job) => {
      const payload = parsePayload(job.payload);
      const syncMap = typeof payload.syncMapId === "string" ? mapById.get(payload.syncMapId) ?? null : null;
      return {
        id: job.id, stage: job.stage, status: job.status, attempts: job.attempts,
        maxAttempts: job.maxAttempts, lastError: job.lastError,
        createdAt: job.createdAt, startedAt: job.startedAt, completedAt: job.completedAt,
        source: typeof payload.source === "string" ? payload.source : "manual",
        signal: typeof payload.signal === "string" ? payload.signal : "",
        tracker: syncMap ? { kind: syncMap.kind, direction: syncMap.direction, externalKey: syncMap.externalKey, externalUrl: syncMap.externalUrl, title: syncMap.title } : null,
        summary: job.pipelineRun.log,
        findings: job.changeImpactFindings,
      };
    }),
  }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const signal = typeof body?.signal === "string" ? body.signal.trim() : "";
  if (!signal || signal.length > 2000) return NextResponse.json({ error: "A change signal between 1 and 2,000 characters is required." }, { status: 400, headers: noStore });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404, headers: noStore });
  try {
    const key = "manual-drift:" + randomUUID();
    const queued = await enqueueChangeImpactJob({
      projectId, source: "manual", idempotencyKey: key, signal,
      externalKey: key.slice(-36), title: "Manual change signal",
    });
    return NextResponse.json({ ok: true, queued: true, jobId: queued.jobId, duplicate: queued.duplicate, status: queued.status }, {
      status: 202, headers: noStore,
    });
  } catch {
    return NextResponse.json({ error: "Could not queue the change-impact analysis." }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const findingId = typeof body?.findingId === "string" ? body.findingId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const note = typeof body?.note === "string" ? body.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000) : "";
  if (!findingId || findingId.length > 128 || !["confirm", "dismiss", "resolve"].includes(action)) {
    return NextResponse.json({ error: "A findingId and confirm, dismiss or resolve action are required." }, { status: 400, headers: noStore });
  }
  const identity = await resolveIdentitySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  const result = await db.$transaction(async (tx) => {
    const finding = await tx.changeImpactFinding.findFirst({
      where: { id: findingId, projectId },
      select: { id: true, status: true, requirementId: true, requirementRef: true, jobId: true },
    });
    if (!finding) return { kind: "missing" as const };
    const transition = resolveChangeImpactTriage(finding.status, action);
    if (!transition) return { kind: "conflict" as const };
    const changed = await tx.changeImpactFinding.updateMany({
      where: { id: finding.id, projectId, status: finding.status },
      data: { status: transition.to, reviewNote: note || null, reviewedBy: identity?.userId ?? null, reviewedAt: new Date() },
    });
    if (changed.count !== 1) return { kind: "conflict" as const };
    if (finding.requirementId) {
      const active = await tx.changeImpactFinding.findMany({
        where: { projectId, requirementId: finding.requirementId, status: { in: ["pending", "confirmed"] } },
        select: { status: true },
      });
      const nextDrift = active.some((item) => item.status === "confirmed") ? "confirmed" : active.length ? "suspected" : "none";
      await tx.requirement.updateMany({ where: { id: finding.requirementId, projectId }, data: { driftStatus: nextDrift } });
    }
    const detail = JSON.stringify({ findingId, requirementRef: finding.requirementRef, jobId: finding.jobId, action, status: transition.to, note });
    await tx.decisionEntry.create({ data: {
      projectId, stage: "DRIFT", actor: "human", action: "change_impact_" + transition.to, detail,
    } });
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
    if (identity?.userId && project?.organizationId) {
      await tx.organizationAuditEvent.create({ data: {
        organizationId: project.organizationId, actorUserId: identity.userId,
        eventType: "change_impact." + transition.to, resourceType: "change_impact_finding",
        resourceId: finding.id, projectId,
      } });
    }
    return { kind: "updated" as const, status: transition.to };
  }, { isolationLevel: "Serializable" });
  if (result.kind === "missing") return NextResponse.json({ error: "Change-impact finding not found." }, { status: 404, headers: noStore });
  if (result.kind === "conflict") return NextResponse.json({ error: "This finding was already reviewed or its state changed. Refresh before retrying." }, { status: 409, headers: noStore });
  return NextResponse.json({ ok: true, status: result.status }, { headers: noStore });
}
