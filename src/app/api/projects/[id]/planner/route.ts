import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runPlanner, ARMS, type PlannerArm } from "@/lib/planner";

type Params = { params: Promise<{ id: string }> };

// GET → ablation history for this project (all arms, newest first)
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const runs = await db.plannerRun.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      arm: r.arm,
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

// POST { arm } → run one planner arm; materialises the live question set
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const arm = String(body.arm ?? "impact_aware") as PlannerArm;
  if (!ARMS.includes(arm)) {
    return NextResponse.json({ error: `Unknown arm "${arm}" — expected one of ${ARMS.join(", ")}` }, { status: 400 });
  }
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const result = await runPlanner(id, arm);
    return NextResponse.json({
      ok: true,
      arm: result.arm,
      candidates: result.candidates,
      metrics: result.metrics,
      questions: result.questions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
