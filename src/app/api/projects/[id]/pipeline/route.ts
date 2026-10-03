import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runStageAgent, harvestMemory } from "@/lib/agents";
import { logDecision } from "@/lib/journal";
import { STAGES, type Stage } from "@/lib/rp";

type Params = { params: Promise<{ id: string }> };

function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  const project = await db.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status === "complete" && action !== "reopen") {
    return NextResponse.json({ error: "Pipeline already complete" }, { status: 409 });
  }

  const stage = project.currentStage as Stage;
  const run = await db.pipelineRun.create({
    data: { projectId: id, stage, status: "running" },
  });

  try {
    // ── action: run the stage agent ─────────────────────────
    if (action === "run") {
      if (project.stageStatus !== "awaiting_input") {
        return NextResponse.json(
          { error: `Cannot run agent while stage is ${project.stageStatus}` },
          { status: 409 }
        );
      }
      await db.project.update({
        where: { id },
        data: { stageStatus: "agent_running" },
      });
      try {
        await runStageAgent(stage, id, run.id);
        await db.pipelineRun.update({
          where: { id: run.id },
          data: { status: "done", completedAt: new Date(), log: "agent finished" },
        });
        await db.project.update({
          where: { id },
          data: { stageStatus: "awaiting_review", updatedAt: new Date() },
        });
        await logDecision(id, stage, "agent", "agent_run", `${stage} agent finished — output awaiting human review.`);
      } catch (err) {
        await db.pipelineRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            log: String(err).slice(0, 1000),
          },
        });
        await db.project.update({
          where: { id },
          data: { stageStatus: "awaiting_input" },
        });
        await logDecision(id, stage, "agent", "agent_failed", String(err).slice(0, 300));
        throw err;
      }
      return NextResponse.json({ ok: true, stageStatus: "awaiting_review" });
    }

    // ── action: approve stage & advance (HITL gate) ─────────
    if (action === "approve") {
      if (project.stageStatus !== "awaiting_review") {
        return NextResponse.json(
          { error: `Stage is not ready for approval (${project.stageStatus})` },
          { status: 409 }
        );
      }

      // stage-specific completion validation
      if (stage === "ELICITATION") {
        const qs = await db.question.findMany({ where: { projectId: id } });
        if (qs.length === 0) {
          return NextResponse.json(
            { error: "No questions to review — run the agent first" },
            { status: 422 }
          );
        }
        const pending = qs.filter((q) => q.resolution === "pending");
        if (pending.length === qs.length) {
          return NextResponse.json(
            { error: "Answer at least one question (or mark it proceed-with-uncertainty) before approving" },
            { status: 422 }
          );
        }
        // mark any still-pending questions as explicitly skipped so the record is auditable
        for (const q of pending) {
          await db.question.update({
            where: { id: q.id },
            data: { answered: true, answer: "(skipped by analyst)", resolution: "answered" },
          });
        }
      }

      if (stage === "PROBLEM_SELECTION") {
        const selected = await db.problemCandidate.count({
          where: { projectId: id, selected: true },
        });
        if (selected !== 1) {
          return NextResponse.json(
            { error: "Select exactly one problem statement before approving" },
            { status: 422 }
          );
        }
      }

      if (stage === "EXTRACTION") {
        const n = await db.requirement.count({ where: { projectId: id } });
        if (n === 0) {
          return NextResponse.json(
            { error: "No requirements extracted — run the agent first" },
            { status: 422 }
          );
        }
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

      const nxt = nextStage(stage);
      if (nxt) {
        await db.project.update({
          where: { id },
          data: { currentStage: nxt, stageStatus: "awaiting_input", updatedAt: new Date() },
        });
      } else {
        // CONFLICTS approved → pipeline complete → harvest memory (I4)
        await db.project.update({
          where: { id },
          data: { status: "complete", stageStatus: "approved", updatedAt: new Date() },
        });
        await harvestMemory(id);
      }

      await logDecision(id, stage, "human", "approved_stage", `Human gate passed for ${stage}.`);
      await db.pipelineRun.update({
        where: { id: run.id },
        data: { status: "done", completedAt: new Date(), log: `stage ${stage} approved` },
      });
      return NextResponse.json({ ok: true, nextStage: nxt });
    }

    // ── action: reopen a completed pipeline ─────────────────
    if (action === "reopen") {
      await db.project.update({
        where: { id },
        data: { status: "active", stageStatus: "awaiting_input", updatedAt: new Date() },
      });
      await logDecision(id, stage, "human", "reopened", "Baseline unlocked for iteration.");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
