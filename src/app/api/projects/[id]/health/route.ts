import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runHealth } from "@/lib/agents";
import { computeDebtProfile } from "@/lib/health";

type Params = { params: Promise<{ id: string }> };

// I14 + dev item 11 — auto-generated requirements health report with a
// fully decomposed, deterministic debt profile (per-dimension scores +
// per-requirement contributions). POST regenerates the LLM narrative;
// GET returns the stored report plus the always-live debt profile.
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
  // Debt profile is computed live from the database on every read
  // (dynamicity rule) — never stale, never cached.
  let debt: Awaited<ReturnType<typeof computeDebtProfile>> | null = null;
  try {
    debt = await computeDebtProfile(id);
  } catch {
    debt = null;
  }
  const artifact = await db.artifact.findFirst({
    where: { projectId: id, stage: "HEALTH" },
    orderBy: { createdAt: "desc" },
  });
  if (!artifact) {
    return NextResponse.json({ report: null, debt });
  }
  try {
    return NextResponse.json({ report: JSON.parse(artifact.content), generatedAt: artifact.createdAt, debt });
  } catch {
    return NextResponse.json({ report: null, debt });
  }
}
