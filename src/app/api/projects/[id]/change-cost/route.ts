import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { traverseImpact } from "@/lib/graph";
import { estimateChangeCost } from "@/lib/change-cost.mjs";
import { CHANGE_COST_MODEL_VERSION, CHANGE_COST_TYPES, summarizeChangeCostCalibration } from "@/lib/change-cost-calibration.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";

type Params = { params: Promise<{ id: string }> };
const ESTIMATE_ACTION = "change_cost_estimate_registered";
const OUTCOME_ACTION = "change_cost_outcome_recorded";
function parseDetail(detail: string): Record<string, unknown> | null {
  try { const value = JSON.parse(detail); return value && typeof value === "object" ? value : null; } catch { return null; }
}
function toRecord(row: { id: string; action: string; detail: string; createdAt: Date }) {
  const detail = parseDetail(row.detail);
  if (!detail || detail.schema !== "modrik.change-cost.v1") return null;
  return { id: row.id, action: row.action, detail, createdAt: row.createdAt.toISOString() };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [estimates, legacyOutcomes, observations] = await Promise.all([
    db.decisionEntry.findMany({
      where: { projectId, stage: "DEBRIEF", action: ESTIMATE_ACTION },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 2000,
      select: { id: true, action: true, detail: true, createdAt: true },
    }),
    db.decisionEntry.findMany({
      where: { projectId, stage: "DEBRIEF", action: OUTCOME_ACTION },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2000,
      select: { id: true, detail: true, createdAt: true },
    }),
    db.changeCostObservation.findMany({
      where: { projectId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2000,
      select: { estimateEntryId: true, actualHours: true, changeType: true, note: true, createdAt: true },
    }),
  ]);
  const estimateRows = estimates.reverse().map(toRecord).filter((row): row is NonNullable<ReturnType<typeof toRecord>> => Boolean(row));
  const outcomes = new Map<string, { actualHours: number; note: string; changeType: string; recordedAt: string }>();
  for (const row of legacyOutcomes) {
    const detail = parseDetail(row.detail);
    if (detail?.schema === "modrik.change-cost.v1" && typeof detail.estimateId === "string" && Number.isFinite(Number(detail.actualHours))) {
      outcomes.set(detail.estimateId, { actualHours: Number(detail.actualHours), note: String(detail.note ?? ""), changeType: typeof detail.changeType === "string" ? detail.changeType : "other", recordedAt: row.createdAt.toISOString() });
    }
  }
  for (const observation of observations) {
    outcomes.set(observation.estimateEntryId, {
      actualHours: observation.actualHours, note: observation.note, changeType: observation.changeType,
      recordedAt: observation.createdAt.toISOString(),
    });
  }
  const records = estimateRows.filter((row) => row.action === ESTIMATE_ACTION).map((row) => {
    const detail = row.detail as { estimate?: Record<string, unknown>; rootRef?: string; modelVersion?: string };
    return { id: row.id, rootRef: detail.rootRef ?? null, estimate: detail.estimate ?? null, modelVersion: detail.modelVersion ?? CHANGE_COST_MODEL_VERSION, createdAt: row.createdAt, outcome: outcomes.get(row.id) ?? null };
  });
  return NextResponse.json({
    records,
    calibration: summarizeChangeCostCalibration(records as Array<{ estimate?: { effortPoints?: number }; createdAt?: string; outcome?: { actualHours?: number; changeType?: string; recordedAt?: string } }>),
    truncated: estimates.length === 2000 || observations.length === 2000 || legacyOutcomes.length === 2000,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return NextResponse.json({ error: "A valid action is required." }, { status: 400 });

  if (body.action === "register_estimate") {
    const requirementId = typeof body.requirementId === "string" ? body.requirementId : "";
    if (!requirementId || requirementId.length > 128) return NextResponse.json({ error: "A valid requirementId is required." }, { status: 400 });
    const requirement = await db.requirement.findFirst({ where: { id: requirementId, projectId } });
    if (!requirement) return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
    const traversal = await traverseImpact(projectId, [requirement.id]);
    const requirements = await db.requirement.findMany({ where: { projectId }, select: { id: true, refId: true, priority: true, ambiguity: true, driftStatus: true, verifyStatus: true } });
    const estimate = estimateChangeCost(requirement, traversal.impacted, requirements);
    const entry = await db.decisionEntry.create({ data: {
      projectId, stage: "DEBRIEF", actor: "human", action: ESTIMATE_ACTION,
      detail: JSON.stringify({ schema: "modrik.change-cost.v1", modelVersion: CHANGE_COST_MODEL_VERSION, rootRequirementId: requirement.id, rootRef: requirement.refId, estimate }),
    } });
    return NextResponse.json({ ok: true, estimateId: entry.id, estimate, createdAt: entry.createdAt.toISOString() }, { status: 201 });
  }

  if (body.action === "record_outcome") {
    const estimateId = typeof body.estimateId === "string" ? body.estimateId : "";
    const actualHours = Number(body.actualHours);
    const note = typeof body.note === "string" ? body.note.trim().replace(/[\\u0000-\\u001f\\u007f]/g, " ").slice(0, 1000) : "";
    const changeType = typeof body.changeType === "string" ? body.changeType : "other";
    if (!estimateId || estimateId.length > 128 || !Number.isFinite(actualHours) || actualHours < 0 || actualHours > 100000 || !CHANGE_COST_TYPES.includes(changeType)) {
      return NextResponse.json({ error: "Provide a valid estimateId, actualHours between 0 and 100000, and a supported changeType." }, { status: 400 });
    }
    const estimate = await db.decisionEntry.findFirst({ where: { id: estimateId, projectId, stage: "DEBRIEF", action: ESTIMATE_ACTION } });
    if (!estimate || parseDetail(estimate.detail)?.schema !== "modrik.change-cost.v1") return NextResponse.json({ error: "Estimate not found in this project." }, { status: 404 });
    const identity = await resolveIdentitySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
    try {
      const saved = await db.$transaction(async (tx) => {
        const observation = await tx.changeCostObservation.create({ data: {
          projectId, estimateEntryId: estimateId, actualHours, changeType, note, recordedBy: identity?.userId ?? null,
        } });
        const entry = await tx.decisionEntry.create({ data: {
          projectId, stage: "DEBRIEF", actor: "human", action: OUTCOME_ACTION,
          detail: JSON.stringify({ schema: "modrik.change-cost.v1", estimateId, actualHours, changeType, note, observationId: observation.id }),
        } });
        return { observation, entry };
      }, { isolationLevel: "Serializable" });
      return NextResponse.json({ ok: true, outcomeId: saved.entry.id, observationId: saved.observation.id, recordedAt: saved.observation.createdAt.toISOString(), changeType }, { status: 201 });
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") return NextResponse.json({ error: "An outcome is already recorded for this estimate." }, { status: 409 });
      throw error;
    }
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
