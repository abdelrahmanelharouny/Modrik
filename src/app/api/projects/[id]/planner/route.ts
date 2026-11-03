import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runPlanner, ARMS, type PlannerArm } from "@/lib/planner";

type Params = { params: Promise<{ id: string }> };

// GET → ablation history for this project (all arms, newest first)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const runs = await db.plannerRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      arm: r.arm,
      experimentId: r.experimentId,
      seed: r.seed,
      candidatePoolHash: r.candidatePoolHash,
      candidatePoolUsed: r.candidatePoolUsed,
      candidates: r.candidates,
      metrics: r.metrics ? JSON.parse(r.metrics) : null,
      latencyMs: r.latencyMs,
      estTokens: r.estTokens,
      promptVersion: r.promptVersion,
      createdAt: r.createdAt,
      questions: JSON.parse(r.questions) as { text: string; askCost: number; utility?: unknown }[],
    })),
  });
}

// POST { arm } → one research ablation arm. The stage is temporarily locked so
// no human edit can race with materialization. Its prior status is restored.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid planner request body" }, { status: 400 });
  }

  const arm = String(body.arm ?? "impact_aware") as PlannerArm;
  if (!ARMS.includes(arm)) {
    return NextResponse.json({ error: `Unknown arm "${arm}" — expected one of ${ARMS.join(", ")}` }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status === "complete" || project.currentStage !== "ELICITATION") {
    return NextResponse.json({ error: "Planner ablation is available only while the project is in ELICITATION." }, { status: 409 });
  }
  if (!["awaiting_input", "awaiting_review"].includes(project.stageStatus)) {
    return NextResponse.json({ error: `Planner cannot run while stage status is ${project.stageStatus}.` }, { status: 409 });
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
    return NextResponse.json({ error: "Project changed or another operation already claimed the stage. Refresh and retry." }, { status: 409 });
  }

  let pipelineRun;
  try {
    pipelineRun = await db.pipelineRun.create({
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
    const result = await runPlanner(id, arm, pipelineRun.id);
    const restored = await db.project.updateMany({
      where: { id, currentStage: "ELICITATION", stageStatus: "agent_running" },
      data: { stageStatus: previousStatus, updatedAt: new Date() },
    });
    if (restored.count !== 1) {
      throw new Error("The ELICITATION stage changed before the planner results were materialized.");
    }
    await db.pipelineRun.update({
      where: { id: pipelineRun.id },
      data: {
        status: "done",
        completedAt: new Date(),
        log: `planner ablation complete: ${arm}`,
      },
    });
    return NextResponse.json({
      ok: true,
      arm: result.arm,
      candidates: result.candidates,
      metrics: result.metrics,
      questions: result.questions,
    });
  } catch (error) {
    await db.pipelineRun.update({
      where: { id: pipelineRun.id },
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
