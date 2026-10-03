import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runHealth } from "@/lib/agents";

type Params = { params: Promise<{ id: string }> };

// I14 — auto-generated requirements health report.
// POST regenerates; GET returns the latest stored report (artifact kind=health).
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const report = await runHealth(id);
    await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const artifact = await db.artifact.findFirst({
    where: { projectId: id, stage: "HEALTH" },
    orderBy: { createdAt: "desc" },
  });
  if (!artifact) {
    return NextResponse.json({ report: null });
  }
  try {
    return NextResponse.json({ report: JSON.parse(artifact.content), generatedAt: artifact.createdAt });
  } catch {
    return NextResponse.json({ report: null });
  }
}
