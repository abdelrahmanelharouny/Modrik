import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import {
  isQualityAssessmentCurrent, normalizeQualityAssessment, QUALITY_STATUSES,
} from "@/lib/requirements/quality.mjs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const assessments = await db.requirementQualityAssessment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { requirement: { select: { id: true, refId: true, text: true, type: true, priority: true, language: true } } },
  });
  return NextResponse.json({
    assessments: assessments.map(assessment => ({
      ...assessment,
      issues: (() => { try { const parsed=JSON.parse(assessment.issues); return Array.isArray(parsed)?parsed:[]; } catch { return []; } })(),
      isCurrent: isQualityAssessmentCurrent(assessment, assessment.requirement),
    })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid assessment payload." }, { status: 400 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) return NextResponse.json({ error: "Requirement assessment is locked while the project pipeline is processing." }, { status: 409 });
  if (typeof body.requirementId !== "string") return NextResponse.json({ error: "requirementId is required." }, { status: 400 });
  const requirement = await db.requirement.findFirst({
    where: { id: body.requirementId, projectId: id },
    select: { id: true, refId: true, text: true, type: true, priority: true, language: true },
  });
  if (!requirement) return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
  let data;
  try { data = normalizeQualityAssessment(body, requirement); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const assessment = await db.requirementQualityAssessment.create({
    data: { projectId: id, requirementId: requirement.id, ...data, status: "proposed", assessedBy: "human" },
  });
  await logDecision(id, "EXTRACTION", "human", "created_requirement_quality_assessment",
    `${requirement.refId}: quality score ${assessment.overallScore}/100 captured against source snapshot ${assessment.sourceHash.slice(0,12)}.`);
  return NextResponse.json({ assessment: { ...assessment, issues: JSON.parse(assessment.issues), isCurrent: true } }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) return NextResponse.json({ error: "Requirement assessment is locked while the project pipeline is processing." }, { status: 409 });
  if (typeof body.assessmentId !== "string" || !["accepted","rejected"].includes(body.status)) return NextResponse.json({ error: "assessmentId and accepted/rejected status are required." }, { status: 400 });
  const assessment = await db.requirementQualityAssessment.findFirst({
    where: { id: body.assessmentId, projectId: id },
    include: { requirement: { select: { id: true, refId: true, text: true, type: true, priority: true, language: true } } },
  });
  if (!assessment) return NextResponse.json({ error: "Assessment not found in this project." }, { status: 404 });
  const isCurrent = isQualityAssessmentCurrent(assessment, assessment.requirement);
  if (body.status === "accepted" && !isCurrent) return NextResponse.json({ error: "This assessment is stale because the requirement changed. Create a fresh assessment before accepting it." }, { status: 409 });
  if (!QUALITY_STATUSES.includes(body.status)) return NextResponse.json({ error: "Unsupported assessment status." }, { status: 400 });
  const updated = await db.requirementQualityAssessment.update({
    where: { id: assessment.id },
    data: { status: body.status, reviewedBy: "owner", reviewedAt: new Date() },
  });
  await logDecision(id, "EXTRACTION", "human", "reviewed_requirement_quality_assessment",
    `${assessment.requirement.refId}: assessment ${assessment.id} marked ${body.status} (score ${assessment.overallScore}/100; ${isCurrent?"current":"stale"}).`);
  return NextResponse.json({ assessment: { ...updated, issues: JSON.parse(updated.issues), isCurrent } });
}
