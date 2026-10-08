import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Dev item 14 — three-group between-subjects user study.
//   A_traditional        — docs + spreadsheet RE toolkit
//   B_unconstrained_llm  — free-form LLM chat
//   C_requirementpilot   — this platform
// Anonymised by design (participantCode only, PDPL-aligned).

const GROUPS = ["A_traditional", "B_unconstrained_llm", "C_requirementpilot"];

// POST { groupId, participantCode, scenarioId, projectId? } → open a session
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const groupId = String(body.groupId ?? "");
  const participantCode = String(body.participantCode ?? "").trim();
  const scenarioId = String(body.scenarioId ?? "").trim();
  if (!GROUPS.includes(groupId)) {
    return NextResponse.json({ error: `groupId must be one of ${GROUPS.join(", ")}` }, { status: 400 });
  }
  if (!participantCode || !scenarioId) {
    return NextResponse.json({ error: "participantCode and scenarioId are required" }, { status: 400 });
  }
  const session = await db.studySession.create({
    data: {
      groupId,
      participantCode: participantCode.slice(0, 60),
      scenarioId: scenarioId.slice(0, 60),
      projectId: body.projectId ? String(body.projectId) : null,
    },
  });
  return NextResponse.json({ ok: true, sessionId: session.id });
}

// PATCH { sessionId, taskTimeSec?, nasaTlx?, susScore?, notes?, event? } → close/log
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  const session = await db.studySession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (body.event) {
    await db.studyEvent.create({
      data: {
        sessionId,
        kind: String(body.event.kind ?? "note").slice(0, 40),
        detail: String(body.event.detail ?? "").slice(0, 600),
      },
    });
  }

  const data: Record<string, unknown> = {};
  if (body.taskTimeSec !== undefined) data.taskTimeSec = Math.max(0, Math.round(Number(body.taskTimeSec) || 0));
  if (body.susScore !== undefined) data.susScore = Math.min(100, Math.max(0, Math.round(Number(body.susScore) || 0)));
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 2000);
  if (body.nasaTlx && typeof body.nasaTlx === "object") {
    const tlx = body.nasaTlx as Record<string, unknown>;
    const dims = ["mental", "physical", "temporal", "performance", "effort", "frustration"];
    const clean: Record<string, number> = {};
    for (const d of dims) {
      const v = Number(tlx[d]);
      if (!Number.isNaN(v)) clean[d] = Math.min(100, Math.max(0, Math.round(v)));
    }
    data.nasaTlx = JSON.stringify(clean);
  }
  if (body.finished) data.finishedAt = new Date();
  if (Object.keys(data).length) {
    await db.studySession.update({ where: { id: sessionId }, data });
  }
  return NextResponse.json({ ok: true });
}

// GET ?export=csv → anonymised dataset for analysis
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("export") !== "csv") {
    const sessions = await db.studySession.findMany({
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { events: true },
    });
    return NextResponse.json({
      sessions: sessions.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        participantCode: s.participantCode,
        scenarioId: s.scenarioId,
        taskTimeSec: s.taskTimeSec,
        nasaTlx: s.nasaTlx ? JSON.parse(s.nasaTlx) : null,
        susScore: s.susScore,
        notes: s.notes,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        eventCount: s.events.length,
      })),
    });
  }

  const sessions = await db.studySession.findMany({ orderBy: { startedAt: "asc" } });
  const header = [
    "session_id",
    "group",
    "participant_code",
    "scenario_id",
    "task_time_sec",
    "tlx_mental",
    "tlx_physical",
    "tlx_temporal",
    "tlx_performance",
    "tlx_effort",
    "tlx_frustration",
    "tlx_overall",
    "sus",
    "started_at",
    "finished_at",
  ].join(",");
  const rows = sessions.map((s) => {
    const tlx = s.nasaTlx ? (JSON.parse(s.nasaTlx) as Record<string, number>) : {};
    const vals = [tlx.mental, tlx.physical, tlx.temporal, tlx.performance, tlx.effort, tlx.frustration];
    const known = vals.filter((v) => v !== undefined);
    const overall = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : "";
    return [
      s.id,
      s.groupId,
      s.participantCode,
      s.scenarioId,
      s.taskTimeSec ?? "",
      ...vals.map((v) => v ?? ""),
      overall,
      s.susScore ?? "",
      s.startedAt.toISOString(),
      s.finishedAt?.toISOString() ?? "",
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="requirementpilot_study_export.csv"',
    },
  });
}
