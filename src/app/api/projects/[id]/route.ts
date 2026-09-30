import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      evidences: { orderBy: { createdAt: "asc" } },
      questions: { orderBy: { order: "asc" } },
      candidates: true,
      reqs: { orderBy: { order: "asc" }, include: { links: true } },
      stories: { orderBy: { refId: "asc" } },
      conflicts: { include: { reqA: true, reqB: true } },
      artifacts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const { reqs, ...rest } = project;
  return NextResponse.json({ project: { ...rest, requirements: reqs } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
