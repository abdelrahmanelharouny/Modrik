import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// Add a new evidence source
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const sourceType = String(body.sourceType ?? "interview");
  const language = String(body.language ?? "en");
  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }

  const count = await db.evidence.count({ where: { projectId: id } });
  const evidence = await db.evidence.create({
    data: {
      projectId: id,
      code: `E${count + 1}`,
      title: title.slice(0, 200),
      content: content.slice(0, 8000),
      sourceType: ["interview", "document", "meeting", "survey", "observation"].includes(sourceType)
        ? sourceType
        : "interview",
      language: ["en", "ar-EG", "codeswitch"].includes(language) ? language : "en",
    },
  });

  // keep the project waiting for input (new evidence may change questions)
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ evidence }, { status: 201 });
}

// Remove an evidence source
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const evidenceId = new URL(req.url).searchParams.get("evidenceId");
  if (!evidenceId) {
    return NextResponse.json({ error: "evidenceId is required" }, { status: 400 });
  }
  await db.evidence.deleteMany({ where: { id: evidenceId, projectId: id } });
  // renumber remaining evidence codes E1..En
  const rest = await db.evidence.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
  });
  let i = 0;
  for (const e of rest) {
    i += 1;
    await db.evidence.update({ where: { id: e.id }, data: { code: `E${i}` } });
  }
  return NextResponse.json({ ok: true });
}
