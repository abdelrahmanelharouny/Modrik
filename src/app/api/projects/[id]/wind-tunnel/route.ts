import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runWindTunnel } from "@/lib/agents";

type Params = { params: Promise<{ id: string }> };

// I7 — synthetic stakeholder wind tunnel: persona-conditioned simulator
// with held-out secrets, used to stress-test the clarifying questions.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const persona = String(body.persona ?? "").trim();
  const secret = String(body.secret ?? "").trim();
  if (!persona) {
    return NextResponse.json({ error: "A persona description is required" }, { status: 400 });
  }

  try {
    const result = await runWindTunnel(id, persona, secret);
    await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
