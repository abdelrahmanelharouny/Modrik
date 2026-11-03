import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
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

// Resolve a single drift signal only after a human review.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const requirementId = new URL(req.url).searchParams.get("requirementId");
  if (!requirementId) {
    return NextResponse.json({ error: "requirementId is required; bulk clearing is not supported." }, { status: 400 });
  }
  const requirement = await db.requirement.findFirst({
    where: { id: requirementId, projectId: id },
    select: { id: true, refId: true, driftStatus: true },
  });
  if (!requirement) return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  if (requirement.driftStatus === "none") {
    return NextResponse.json({ error: "No active drift flag exists for this requirement." }, { status: 409 });
  }
  await db.requirement.update({
    where: { id: requirement.id },
    data: { driftStatus: "none" },
  });
  await logDecision(id, "LIFECYCLE", "human", "dismissed_requirement_drift", `${requirement.refId}: suspected drift dismissed after human review.`);
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true, requirementId });
}
