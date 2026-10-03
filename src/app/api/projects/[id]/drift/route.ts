import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDrift } from "@/lib/agents";

type Params = { params: Promise<{ id: string }> };

// I8 — drift radar: check a post-baseline change signal against the
// frozen requirement graph and flag impacted requirements.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const signal = String(body.signal ?? "").trim();
  if (!signal) {
    return NextResponse.json({ error: "A change signal description is required" }, { status: 400 });
  }

  try {
    const result = await runDrift(id, signal);
    await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}

// Clear all drift flags (after the team has triaged them)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.requirement.updateMany({ where: { projectId: id }, data: { driftStatus: "none" } });
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
