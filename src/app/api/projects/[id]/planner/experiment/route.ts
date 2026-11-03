import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ARMS, runPlannerExperiment, type PlannerArm } from "@/lib/planner";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid experiment request body" }, { status: 400 });
  }

  const materializeArm = String(body.materializeArm ?? "impact_aware") as PlannerArm;
  if (!ARMS.includes(materializeArm)) {
    return NextResponse.json(
      { error: "Unknown materialized arm. Expected one of " + ARMS.join(", ") },
      { status: 400 }
    );
  }
  const seed = body.seed === undefined ? undefined : String(body.seed).trim();
  if (seed !== undefined && (!seed || seed.length > 120)) {
    return NextResponse.json({ error: "seed must contain 1 to 120 characters" }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status === "complete" || project.currentStage !== "ELICITATION") {
    return NextResponse.json({ error: "Planner experiments are only available during ELICITATION." }, { status: 409 });
  }
  if (!["awaiting_input", "awaiting_review"].includes(project.stageStatus)) {
    return NextResponse.json({ error: "The ELICITATION stage is already processing." }, { status: 409 });
  }

  const previousStatus = project.stageStatus;
  const claim = await db.project.updateMany({
    where: {
      id,
      currentStage: "ELICITATION",
      status: project.status,
      stageStatus: previousStatus,
      updatedAt: project.updatedAt,
    },
    data: { stageStatus: "agent_running", updatedAt: new Date() },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: "Project changed or another operation claimed this stage. Refresh and retry." }, { status: 409 });
  }

  let run;
  try {
    run = await db.pipelineRun.create({
      data: { projectId: id, stage: "ELICITATION", status: "running" },
    });
  } catch (error) {
    await db.project.updateMany({
      where: { id, currentStage: "ELICITATION", stageStatus: "agent_running" },
      data: { stageStatus: previousStatus, updatedAt: new Date() },
    });
    throw error;
  }

  try {
    const result = await runPlannerExperiment(id, {
      seed,
      materializeArm,
      runId: run.id,
    });
    const restored = await db.project.updateMany({
      where: { id, currentStage: "ELICITATION", stageStatus: "agent_running" },
      data: { stageStatus: previousStatus, updatedAt: new Date() },
    });
    if (restored.count !== 1) {
      throw new Error("The ELICITATION stage changed before experiment results could be committed.");
    }
    await db.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "done",
        completedAt: new Date(),
        log: "Four-arm common-pool experiment " + result.experimentId,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await db.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        log: String(error instanceof Error ? error.message : error).slice(0, 1000),
      },
    });
    await db.project.updateMany({
      where: { id, currentStage: "ELICITATION", stageStatus: "agent_running" },
      data: { stageStatus: previousStatus, updatedAt: new Date() },
    });
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error).slice(0, 500) },
      { status: 500 }
    );
  }
}
