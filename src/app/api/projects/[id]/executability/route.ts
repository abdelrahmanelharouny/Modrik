import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runExecutability, getExecScenarios } from "@/lib/executability";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const scenarios = await getExecScenarios(id);
  return NextResponse.json({
    scenarios,
    summary: {
      total: scenarios.length,
      defined: scenarios.filter((s) => s.resolution === "defined").length,
      undefined: scenarios.filter((s) => s.resolution === "undefined").length,
    },
  });
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const reqCount = await db.requirement.count({ where: { projectId: id } });
  if (reqCount === 0) {
    return NextResponse.json({ error: "No requirements to simulate — run the extraction stage first" }, { status: 422 });
  }
  try {
    const result = await runExecutability(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
