import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runStageAgent, harvestMemory } from "@/lib/agents";
import { runPlanner, ARMS, type PlannerArm } from "@/lib/planner";
import { logDecision } from "@/lib/journal";
import { hasHumanQuestionDecision } from "@/lib/security/data-safety.mjs";
import { STAGES, type Stage } from "@/lib/rp";

type Params = { params: Promise<{ id: string }> };
type Validation = { ok: true } | { ok: false; status: number; error: string };

function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
}

async function validateApproval(projectId: string, stage: Stage): Promise<Validation> {
  if (stage === "ELICITATION") {
    const questions = await db.question.findMany({
      where: { projectId },
      select: { answered: true, answer: true, answerSource: true, resolution: true },
    });
    if (questions.length === 0) {
      return { ok: false, status: 422, error: "No questions to review — run the planner first." };
    }
    if (!hasHumanQuestionDecision(questions)) {
      return {
        ok: false,
        status: 422,
        error: "At least one real stakeholder answer or an explicitly recorded uncertainty decision is required. Synthetic Wind Tunnel answers do not count.",
      };
    }
  }

  if (stage === "PROBLEM_SELECTION") {
    const selected = await db.problemCandidate.count({ where: { projectId, selected: true } });
    if (selected !== 1) {
      return { ok: false, status: 422, error: "Select exactly one problem statement before approving." };
    }
  }

  if (stage === "EXTRACTION") {
    const requirements = await db.requirement.findMany({
      where: { projectId },
      select: { refId: true, verifyStatus: true, links: { select: { id: true } } },
    });
    if (requirements.length === 0) {
      return { ok: false, status: 422, error: "No requirements extracted — run the agent first." };
    }
    const ungrounded = requirements.filter((requirement) => requirement.links.length === 0);
    if (ungrounded.length) {
      return {
        ok: false,
        status: 422,
        error: `Requirements without evidence trace links must be grounded or removed: ${ungrounded.map((r) => r.refId).join(", ")}.`,
      };
    }
    const unverified = requirements.filter((requirement) => requirement.verifyStatus === "unverified");
    if (unverified.length) {
      return {
        ok: false,
        status: 422,
        error: `Requirements whose verifier did not complete must be reviewed and re-verified: ${unverified.map((r) => r.refId).join(", ")}.`,
      };
    }
    // A weak verdict remains approvable only through this explicit human gate.
    // The verifier is advisory; it must not silently turn a weak result into support.
  }

  if (stage === "STORIES") {
    const count = await db.userStory.count({ where: { projectId } });
    if (count === 0) {
      return { ok: false, status: 422, error: "No user stories exist — run the story generator or document why stories are not applicable." };
    }
  }

  if (stage === "CONFLICTS") {
    const open = await db.conflict.count({ where: { projectId, status: "open" } });
    if (open > 0) {
      return { ok: false, status: 422, error: `${open} conflict(s) remain open. Resolve each conflict before completing the baseline.` };
    }
  }

  return { ok: true };
}

async function restoreStageStatus(projectId: string, stage: Stage, claimedStatus: string, restoreStatus: string) {
  await db.project.updateMany({
    where: { id: projectId, currentStage: stage, stageStatus: claimedStatus },
    data: { stageStatus: restoreStatus, updatedAt: new Date() },
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
    const changed = await db.project.updateMany({
      where: {
        id,
        status: "complete",
        stageStatus: project.stageStatus,
        updatedAt: project.updatedAt,
      },
      data: { status: "active", stageStatus: "awaiting_input", updatedAt: new Date() },
    });
    if (changed.count !== 1) {
      return NextResponse.json({ error: "Project changed while reopening. Refresh and retry." }, { status: 409 });
    }
    await logDecision(id, project.currentStage, "human", "reopened", "Baseline unlocked for iteration.");
    return NextResponse.json({ ok: true, currentStage: project.currentStage });
  }

  if (project.status === "complete") {
    return NextResponse.json({ error: "Pipeline already complete" }, { status: 409 });
  }
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
    return NextResponse.json(
      { error: action === "run"
        ? `Cannot run agent while stage is ${project.stageStatus}`
        : `Stage is not ready for approval (${project.stageStatus})` },
      { status: 409 }
    );
  }

  if (action === "approve") {
    const preflight = await validateApproval(id, stage);
    if (!preflight.ok) return NextResponse.json({ error: preflight.error }, { status: preflight.status });
  }

  // Compare-and-swap claim: exactly one concurrent run/approval can own a stage.
  const claim = await db.project.updateMany({
    where: {
      id,
      currentStage: stage,
      stageStatus: expectedStatus,
      status: project.status,
      updatedAt: project.updatedAt,
    },
    data: { stageStatus: claimedStatus, updatedAt: new Date() },
  });
  if (claim.count !== 1) {
    return NextResponse.json({ error: "This stage changed or another operation already claimed it. Refresh and retry." }, { status: 409 });
  }

  let run;
  try {
    run = await db.pipelineRun.create({
      data: { projectId: id, stage, status: "running" },
    });
  } catch (error) {
    await restoreStageStatus(id, stage, claimedStatus, expectedStatus);
    throw error;
  }

  try {
    if (action === "run") {
      if (stage === "ELICITATION") {
        await runPlanner(id, plannerArm!, run.id);
      } else {
        await runStageAgent(stage, id, run.id);
      }

      const completed = await db.project.updateMany({
        where: { id, currentStage: stage, stageStatus: claimedStatus },
        data: { stageStatus: "awaiting_review", updatedAt: new Date() },
      });
      if (completed.count !== 1) {
        throw new Error("Stage ownership changed before agent results were committed.");
      }
      await logDecision(id, stage, "agent", "agent_run", `${stage} agent finished — output awaiting human review.`);
      await db.pipelineRun.update({
        where: { id: run.id },
        data: { status: "done", completedAt: new Date(), log: "agent finished" },
      });
      return NextResponse.json({ ok: true, stageStatus: "awaiting_review" });
    }

    // Revalidate after acquiring the stage claim; the preflight above is only
    // an early response optimization and is not the final source of truth.
    const validation = await validateApproval(id, stage);
    if (!validation.ok) {
      await db.project.updateMany({
        where: { id, currentStage: stage, stageStatus: claimedStatus },
        data: { stageStatus: "awaiting_review", updatedAt: new Date() },
      });
      await db.pipelineRun.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date(), log: validation.error },
      });
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    if (stage === "ELICITATION") {
      // Pending means unanswered, not a fabricated answer or an assumption.
      await db.question.updateMany({
        where: { projectId: id, resolution: "pending" },
        data: { answered: false, answer: null, resolution: "skipped", answerSource: "skipped" },
      });
    }

    if (stage === "EXTRACTION") {
      await db.requirement.updateMany({
        where: { projectId: id },
        data: { status: "approved" },
      });
    }

    if (stage === "STORIES") {
      await db.userStory.updateMany({
        where: { projectId: id },
        data: { status: "approved" },
      });
    }

    const next = nextStage(stage);
    const transitioned = next
      ? await db.project.updateMany({
          where: { id, currentStage: stage, stageStatus: claimedStatus },
          data: { currentStage: next, stageStatus: "awaiting_input", updatedAt: new Date() },
        })
      : await db.project.updateMany({
          where: { id, currentStage: stage, stageStatus: claimedStatus },
          data: { status: "complete", stageStatus: "approved", updatedAt: new Date() },
        });
    if (transitioned.count !== 1) {
      throw new Error("Stage state changed before approval could be committed.");
    }

    await logDecision(id, stage, "human", "approved_stage", `Human gate passed for ${stage}.`);
    await db.pipelineRun.update({
      where: { id: run.id },
      data: { status: "done", completedAt: new Date(), log: `stage ${stage} approved` },
    });

    if (!next) await harvestMemory(id);
    return NextResponse.json({ ok: true, nextStage: next });
  } catch (error) {
    await db.pipelineRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        log: String(error instanceof Error ? error.message : error).slice(0, 1000),
      },
    });
    await restoreStageStatus(id, stage, claimedStatus, expectedStatus);
    await logDecision(id, stage, "agent", "pipeline_operation_failed", String(error).slice(0, 300));
    return NextResponse.json(
      { error: String(error instanceof Error ? error.message : error).slice(0, 500) },
      { status: 500 }
    );
  }
}
