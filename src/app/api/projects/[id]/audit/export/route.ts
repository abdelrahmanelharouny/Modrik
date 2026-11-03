import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditRowsToCsv } from "@/lib/audit-export.mjs";

type Params = { params: Promise<{ id: string }> };

function parseDate(value: string | null, label: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(label + " must be a valid ISO date");
  return date;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const query = request.nextUrl.searchParams;
  const format = query.get("format") === "csv" ? "csv" : "json";
  const parsedLimit = Number(query.get("limit") ?? "5000");
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return NextResponse.json({ error: "limit must be an integer between 1 and 10000" }, { status: 400 });
  }
  const limit = Math.min(parsedLimit, 10_000);
  const actor = query.get("actor");
  if (actor && !["human", "agent", "system"].includes(actor)) {
    return NextResponse.json({ error: "actor must be human, agent or system" }, { status: 400 });
  }
  const stage = (query.get("stage") ?? "").trim().slice(0, 80);
  const action = (query.get("action") ?? "").trim().slice(0, 100);
  let from: Date | null, to: Date | null;
  try {
    from = parseDate(query.get("from"), "from");
    to = parseDate(query.get("to"), "to");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid date filter" }, { status: 400 });
  }
  if (from && to && from > to) return NextResponse.json({ error: "from must not be later than to" }, { status: 400 });

  const rows = await db.decisionEntry.findMany({
    where: {
      projectId: id,
      ...(actor ? { actor } : {}),
      ...(stage ? { stage } : {}),
      ...(action ? { action } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: { id: true, createdAt: true, stage: true, actor: true, action: true, detail: true },
  });
  const truncated = rows.length > limit;
  const decisions = rows.slice(0, limit).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const filename = "modrik-" + encodeURIComponent(project.id) + "-audit." + format;
  if (format === "csv") {
    return new NextResponse(auditRowsToCsv(decisions), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "no-store, max-age=0",
        "X-Export-Truncated": truncated ? "true" : "false",
      },
    });
  }
  return NextResponse.json({
    project: { id: project.id, name: project.name },
    generatedAt: new Date().toISOString(),
    count: decisions.length,
    limit,
    truncated,
    decisions,
  }, {
    headers: {
      "Content-Disposition": 'attachment; filename="' + filename + '"',
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
