import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { harvestMemory } from "@/lib/agents";
import { ARMS, type PlannerArm } from "@/lib/planner";
import { logDecision } from "@/lib/journal";
import {
  validateElicitationApproval,
  validateRequirementApproval,
  validateConflictApproval,
  validateStoryApproval,
} from "@/lib/pipeline/approval-rules.mjs";
import { STAGES, type Stage } from "@/lib/rp";

type Params = { params: Promise<{ id: string }> };
type Validation = { ok: true } | { ok: false; status: number; error: string };

function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
}
function maxJobAttempts() {
  const raw = Number(process.env.PIPELINE_JOB_MAX_ATTEMPTS ?? 5);
  return Number.isSafeInteger(raw) ? Math.max(1, Math.min(12, raw)) : 5;
}

async function validateApproval(projectId: string, stage: Stage, client: typeof db = db): Promise<Validation> {
  if (stage === "ELICITATION") {
    const questions = await client.question.findMany({
      where: { projectId },
      select: { answered: true, answer: true, answerSource: true, resolution: true },
    });
    const error = validateElicitationApproval(questions);
    if (error) return { ok: false, status: 422, error };
  }
  if (stage === "PROBLEM_SELECTION") {
    const selected = await client.problemCandidate.count({ where: { projectId, selected: true } });
    if (selected !== 1) return { ok: false, status: 422, error: "Select exactly one problem statement before approving." };
  }
  if (stage === "EXTRACTION") {
    const requirements = await client.requirement.findMany({
      where: { projectId },
      select: { refId: true, verifyStatus: true, verificationSource: true, links: { select: { id: true, evidenceId: true } } },
    });
    const error = validateRequirementApproval(requirements);
    if (error) return { ok: false, status: 422, error };
  }
  if (stage === "STORIES") {
    const count = await client.userStory.count({ where: { projectId } });
    const error = validateStoryApproval(count);
    if (error) return { ok: false, status: 422, error };
  }
  if (stage === "CONFLICTS") {
    const conflicts = await client.conflict.findMany({ where: { projectId }, select: { status: true } });
    const error = validateConflictApproval(conflicts);
    if (error) return { ok: false, status: 422, error };
  }
  return { ok: true };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, status: true, currentStage: true, stageStatus: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const job = await db.agentJob.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, stage: true, status: true, attempts: true, maxAttempts: true,
      availableAt: true, lastError: true, createdAt: true, startedAt: true,
      completedAt: true, leaseExpiresAt: true,
      pipelineRun: { select: { id: true, latencyMs: true, estTokens: true, estCostUsd: true, promptVersion: true } },
    },
  });
  return NextResponse.json({ project, job }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid pipeline request body" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (!["run", "approve", "reopen"].includes(action)) {
    return NextResponse.json({ error: "Unknown action. Expected run, approve or reopen." }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (action === "reopen") {
    if (project.status !== "complete") {
      return NextResponse.json({ error: "Only a completed baseline can be reopened." }, { status: 409 });
    }
    const reopened = await db.$transaction(async (tx) => {
      const changed = await tx.project.updateMany({
        where: { id, status: "complete", stageStatus: project.stageStatus, updatedAt: project.updatedAt },
        data: { status: "active", stageStatus: "awaiting_input", updatedAt: new Date() },
      });
      if (changed.count !== 1) return false;
      await tx.decisionEntry.create({
        data: { projectId: id, stage: project.currentStage, actor: "human", action: "reopened", detail: "Baseline unlocked for iteration." },
      });
      return true;
    });
    if (!reopened) return NextResponse.json({ error: "Project changed while reopening. Refresh and retry." }, { status: 409 });
    return NextResponse.json({ ok: true, currentStage: project.currentStage });
  }

  if (project.status === "complete") return NextResponse.json({ error: "Pipeline already complete" }, { status: 409 });
  if (!STAGES.includes(project.currentStage as Stage)) {
    return NextResponse.json({ error: "Project has an invalid pipeline stage. Repair the stage before continuing." }, { status: 409 });
  }
  const stage = project.currentStage as Stage;
  let plannerArm: PlannerArm | null = null;
  if (action === "run" && stage === "ELICITATION") {
    const armRaw = String(body.arm ?? process.env.RP_PLANNER_ARM ?? "impact_aware");
    if (!ARMS.includes(armRaw as PlannerArm)) {
      return NextResponse.json({ error: `Unknown planner arm "${armRaw}". Expected one of ${ARMS.join(", ")}.` }, { status: 400 });
    }
    plannerArm = armRaw as PlannerArm;
  }
  const expectedStatus = action === "run" ? "awaiting_input" : "awaiting_review";
  const claimedStatus = action === "run" ? "agent_running" : "approving";
  if (project.stageStatus !== expectedStatus) {
    return NextResponse.json({
      error: action === "run"
        ? `Cannot run agent while stage is ${project.stageStatus}`
        : `Stage is not ready for approval (${project.stageStatus})`,
    }, { status: 409 });
  }

  if (action === "approve") {
    const preflight = await validateApproval(id, stage);
    if (!preflight.ok) return NextResponse.json({ error: preflight.error }, { status: preflight.status });

    // Keep the review claim and run record atomic, just like queue enqueue.
    const run = await db.$transaction(async (tx) => {
      const claim = await tx.project.updateMany({
        where: { id, currentStage: stage, stageStatus: expectedStatus, status: project.status, updatedAt: project.updatedAt },
        data: { stageStatus: claimedStatus, updatedAt: new Date() },
      });
      if (claim.count !== 1) return null;
      return tx.pipelineRun.create({ data: { projectId: id, stage, status: "running" } });
    });
    if (!run) return NextResponse.json({ error: "This stage changed or another operation already claimed it. Refresh and retry." }, { status: 409 });

    const finalization = await db.$transaction(async (tx) => {
      const validation = await validateApproval(id, stage, tx as unknown as typeof db);
      if (!validation.ok) {
        const restored = await tx.project.updateMany({
          where: { id, currentStage: stage, stageStatus: claimedStatus },
          data: { stageStatus: "awaiting_review", updatedAt: new Date() },
        });
        if (restored.count !== 1) throw new Error("Stage ownership changed while rejecting the approval.");
        await tx.pipelineRun.update({ where: { id: run.id }, data: { status: "failed", completedAt: new Date(), log: validation.error } });
        return { ok: false as const, validation };
      }
      if (stage === "ELICITATION") {
        await tx.question.updateMany({
          where: { projectId: id, resolution: "pending" },
          data: { answered: false, answer: null, resolution: "skipped", answerSource: "skipped" },
        });
      }
      if (stage === "EXTRACTION") await tx.requirement.updateMany({ where: { projectId: id }, data: { status: "approved" } });
      if (stage === "STORIES") await tx.userStory.updateMany({ where: { projectId: id }, data: { status: "approved" } });

      const next = nextStage(stage);
      const transitioned = next
        ? await tx.project.updateMany({
            where: { id, currentStage: stage, stageStatus: claimedStatus },
            data: { currentStage: next, stageStatus: "awaiting_input", updatedAt: new Date() },
          })
        : await tx.project.updateMany({
            where: { id, currentStage: stage, stageStatus: claimedStatus },
            data: { status: "complete", stageStatus: "approved", updatedAt: new Date() },
          });
      if (transitioned.count !== 1) throw new Error("Stage state changed before approval could be committed.");
      await tx.decisionEntry.create({
        data: { projectId: id, stage, actor: "human", action: "approved_stage", detail: `Human gate passed for ${stage}.` },
      });
      await tx.pipelineRun.update({
        where: { id: run.id },
        data: { status: "done", completedAt: new Date(), log: `stage ${stage} approved` },
      });
      return { ok: true as const, next };
    });

    if (!finalization.ok) return NextResponse.json({ error: finalization.validation.error }, { status: finalization.validation.status });
    if (!finalization.next) {
      try {
        await harvestMemory(id);
      } catch (error) {
        await logDecision(id, stage, "system", "memory_harvest_failed",
          String(error instanceof Error ? error.message : error).slice(0, 300));
      }
    }
    return NextResponse.json({ ok: true, nextStage: finalization.next });
  }

  // Queue enqueue is a single transaction: no claimed stage can exist without
  // its PipelineRun + AgentJob, and a run cannot be enqueued twice.
  const enqueued = await db.$transaction(async (tx) => {
    const claim = await tx.project.updateMany({
      where: { id, currentStage: stage, stageStatus: expectedStatus, status: project.status, updatedAt: project.updatedAt },
      data: { stageStatus: claimedStatus, updatedAt: new Date() },
    });
    if (claim.count !== 1) return null;
    const run = await tx.pipelineRun.create({ data: { projectId: id, stage, status: "running" } });
    const job = await tx.agentJob.create({
      data: {
        projectId: id, pipelineRunId: run.id, stage, status: "queued",
        payload: JSON.stringify(plannerArm ? { arm: plannerArm } : {}),
        maxAttempts: maxJobAttempts(),
      },
    });
    await tx.decisionEntry.create({
      data: { projectId: id, stage, actor: "system", action: "agent_queued", detail: `Agent stage queued as durable job ${job.id}.` },
    });
    return { runId: run.id, jobId: job.id };
  }, { isolationLevel: "Serializable" });
  if (!enqueued) return NextResponse.json({ error: "This stage changed or another operation already claimed it. Refresh and retry." }, { status: 409 });
  return NextResponse.json({ ok: true, status: "queued", ...enqueued }, {
    status: 202,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
