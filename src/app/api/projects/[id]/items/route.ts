import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/**
 * Generic HITL item editing endpoint.
 * body: { kind: "question"|"candidate"|"requirement"|"story"|"conflict",
 *         itemId: string, data: object }
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const itemId = String(body.itemId ?? "");
  const data = (body.data ?? {}) as Record<string, unknown>;
  if (!itemId || !kind) {
    return NextResponse.json({ error: "kind and itemId are required" }, { status: 400 });
  }

  const touch = { updatedAt: new Date() };

  switch (kind) {
    case "question": {
      const answer = String(data.answer ?? "").slice(0, 2000);
      const q = await db.question.findFirst({ where: { id: itemId, projectId: id } });
      if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });
      await db.question.update({
        where: { id: itemId },
        data: { answer, answered: answer.trim().length > 0 },
      });
      break;
    }

    case "candidate": {
      const c = await db.problemCandidate.findFirst({ where: { id: itemId, projectId: id } });
      if (!c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      const patch: Record<string, unknown> = {};
      if (data.impact !== undefined)
        patch.impact = Math.min(5, Math.max(1, Math.round(Number(data.impact) || 3)));
      if (data.effort !== undefined)
        patch.effort = Math.min(5, Math.max(1, Math.round(Number(data.effort) || 3)));
      if (data.selected === true) {
        await db.problemCandidate.updateMany({ where: { projectId: id }, data: { selected: false } });
        patch.selected = true;
      } else if (data.selected === false) {
        patch.selected = false;
      }
      await db.problemCandidate.update({ where: { id: itemId }, data: patch });
      break;
    }

    case "requirement": {
      const r = await db.requirement.findFirst({ where: { id: itemId, projectId: id } });
      if (!r) return NextResponse.json({ error: "Requirement not found" }, { status: 404 });

      // apply the ambiguity agent's suggested rewrite
      if (data.action === "apply_suggestion") {
        if (!r.suggestion) {
          return NextResponse.json({ error: "No suggestion to apply" }, { status: 422 });
        }
        await db.requirement.update({
          where: { id: itemId },
          data: { text: r.suggestion, suggestion: null, status: "revised" },
        });
        break;
      }

      const patch: Record<string, unknown> = {};
      if (typeof data.text === "string" && data.text.trim())
        patch.text = data.text.trim().slice(0, 800);
      if (typeof data.type === "string" && ["functional", "nonfunctional", "constraint"].includes(data.type))
        patch.type = data.type;
      if (typeof data.priority === "string" && ["Must", "Should", "Could", "Won't"].includes(data.priority))
        patch.priority = data.priority;
      if (typeof data.status === "string") patch.status = data.status;
      await db.requirement.update({ where: { id: itemId }, data: patch });
      break;
    }

    case "story": {
      const s = await db.userStory.findFirst({ where: { id: itemId, projectId: id } });
      if (!s) return NextResponse.json({ error: "Story not found" }, { status: 404 });
      const patch: Record<string, unknown> = {};
      if (typeof data.title === "string" && data.title.trim()) patch.title = data.title.trim().slice(0, 200);
      if (typeof data.narrative === "string" && data.narrative.trim()) patch.narrative = data.narrative.trim().slice(0, 800);
      if (typeof data.acceptance === "string") patch.acceptance = data.acceptance.slice(0, 2000);
      if (typeof data.status === "string") patch.status = data.status;
      await db.userStory.update({ where: { id: itemId }, data: patch });
      break;
    }

    case "conflict": {
      const c = await db.conflict.findFirst({ where: { id: itemId, projectId: id } });
      if (!c) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
      const resolution = String(data.resolution ?? "").slice(0, 1000);
      await db.conflict.update({
        where: { id: itemId },
        data: {
          resolution: resolution || c.resolution,
          status: resolution.trim() ? "resolved" : c.status,
        },
      });
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown item kind" }, { status: 400 });
  }

  await db.project.update({ where: { id }, data: touch });
  return NextResponse.json({ ok: true });
}

// Delete a requirement or story (human curation)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const kind = new URL(req.url).searchParams.get("kind");
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!kind || !itemId) {
    return NextResponse.json({ error: "kind and itemId are required" }, { status: 400 });
  }
  if (kind === "requirement") {
    await db.requirement.deleteMany({ where: { id: itemId, projectId: id } });
  } else if (kind === "story") {
    await db.userStory.deleteMany({ where: { id: itemId, projectId: id } });
  } else if (kind === "conflict") {
    await db.conflict.deleteMany({ where: { id: itemId, projectId: id } });
  } else {
    return NextResponse.json({ error: "Unknown item kind" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
