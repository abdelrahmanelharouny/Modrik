import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { traverseImpact } from "@/lib/graph";
import { estimateChangeCost } from "@/lib/change-cost.mjs";
import { CHANGE_COST_MODEL_VERSION, summarizeChangeCostCalibration } from "@/lib/change-cost-calibration.mjs";

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
  const rows = await db.decisionEntry.findMany({
    where: { projectId, stage: "DEBRIEF", action: { in: [ESTIMATE_ACTION, OUTCOME_ACTION] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 2000,
    select: { id: true, action: true, detail: true, createdAt: true },
  });
  const parsed = rows.map(toRecord).filter((row): row is NonNullable<ReturnType<typeof toRecord>> => Boolean(row));
  const estimates = new Map(parsed.filter((row) => row.action === ESTIMATE_ACTION).map((row) => [row.id, row]));
  const outcomes = new Map<string, { actualHours: number; note: string; recordedAt: string }>();
  for (const row of parsed.filter((item) => item.action === OUTCOME_ACTION)) {
    const detail = row.detail as { estimateId?: string; actualHours?: number; note?: string };
    if (typeof detail.estimateId === "string" && Number.isFinite(detail.actualHours)) {
      outcomes.set(detail.estimateId, { actualHours: Number(detail.actualHours), note: String(detail.note ?? ""), recordedAt: row.createdAt });
    }
  }
  const records = [...estimates.entries()].map(([estimateId, row]) => {
    const detail = row.detail as { estimate?: Record<string, unknown>; rootRef?: string; modelVersion?: string };
    return { id: estimateId, rootRef: detail.rootRef ?? null, estimate: detail.estimate ?? null, modelVersion: detail.modelVersion ?? CHANGE_COST_MODEL_VERSION, createdAt: row.createdAt, outcome: outcomes.get(estimateId) ?? null };
  });
  return NextResponse.json({ records, calibration: summarizeChangeCostCalibration(records as Array<{ estimate?: { effortPoints?: number }; outcome?: { actualHours?: number } }>), truncated: rows.length === 2000 }, { headers: { "Cache-Control": "no-store, max-age=0" } });
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
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
    if (!estimateId || estimateId.length > 128 || !Number.isFinite(actualHours) || actualHours < 0 || actualHours > 100000) {
      return NextResponse.json({ error: "Provide a valid estimateId and actualHours between 0 and 100000." }, { status: 400 });
    }
    const estimate = await db.decisionEntry.findFirst({ where: { id: estimateId, projectId, stage: "DEBRIEF", action: ESTIMATE_ACTION } });
    if (!estimate || parseDetail(estimate.detail)?.schema !== "modrik.change-cost.v1") return NextResponse.json({ error: "Estimate not found in this project." }, { status: 404 });
    const outcomeRows = await db.decisionEntry.findMany({ where: { projectId, stage: "DEBRIEF", action: OUTCOME_ACTION }, select: { id: true, detail: true } });
    const alreadyRecorded = outcomeRows.some((row) => parseDetail(row.detail)?.estimateId === estimateId);
    if (alreadyRecorded) return NextResponse.json({ error: "An outcome is already recorded for this estimate." }, { status: 409 });
    const entry = await db.decisionEntry.create({ data: {
      projectId, stage: "DEBRIEF", actor: "human", action: OUTCOME_ACTION,
      detail: JSON.stringify({ schema: "modrik.change-cost.v1", estimateId, actualHours, note }),
    } });
    return NextResponse.json({ ok: true, outcomeId: entry.id, recordedAt: entry.createdAt.toISOString() }, { status: 201 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
