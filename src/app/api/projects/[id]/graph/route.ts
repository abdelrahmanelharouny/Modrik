import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractEdges, getGraph, traverseImpact, EDGE_KINDS } from "@/lib/graph";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const graph = await getGraph(id);
  return NextResponse.json(graph);
}

// POST { action: "extract" | "traverse" | "add" | "delete", ... }
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  try {
    if (action === "extract") {
      const result = await extractEdges(id);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "traverse") {
      const ids: string[] = Array.isArray(body.requirementIds) ? body.requirementIds.map(String) : [];
      if (!ids.length) return NextResponse.json({ error: "requirementIds[] required" }, { status: 400 });
      const result = await traverseImpact(id, ids);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "add") {
      const fromId = String(body.fromId ?? "");
      const toId = String(body.toId ?? "");
      const kind = String(body.kind ?? "");
      if (!(EDGE_KINDS as readonly string[]).includes(kind)) {
        return NextResponse.json({ error: `kind must be one of ${EDGE_KINDS.join(", ")}` }, { status: 400 });
      }
      const [from, to] = await Promise.all([
        db.requirement.findFirst({ where: { id: fromId, projectId: id } }),
        db.requirement.findFirst({ where: { id: toId, projectId: id } }),
      ]);
      if (!from || !to) return NextResponse.json({ error: "Requirement not found in this project" }, { status: 404 });
      if (from.id === to.id) return NextResponse.json({ error: "Self edges are not allowed" }, { status: 422 });
      const edge = await db.reqEdge.upsert({
        where: { fromId_toId_kind: { fromId: from.id, toId: to.id, kind } },
        create: { projectId: id, fromId: from.id, toId: to.id, kind, note: String(body.note ?? "").slice(0, 300) || null, origin: "human" },
        update: { note: String(body.note ?? "").slice(0, 300) || null },
      });
      return NextResponse.json({ ok: true, edge });
    }

    if (action === "delete") {
      const edgeId = String(body.edgeId ?? "");
      const edge = await db.reqEdge.findFirst({ where: { id: edgeId, projectId: id } });
      if (!edge) return NextResponse.json({ error: "Edge not found" }, { status: 404 });
      await db.reqEdge.delete({ where: { id: edge.id } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
