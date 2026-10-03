import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runCompliance } from "@/lib/agents";

type Params = { params: Promise<{ id: string }> };

// I11 — compliance / NFR constraint packs checked against the requirement graph
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const pack = String(body.pack ?? "gdpr");

  try {
    const result = await runCompliance(id, pack);
    await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
