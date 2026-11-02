import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csvCell } from "@/lib/security/csv.mjs";
import { issueParticipantToken } from "@/lib/study/participant-token.mjs";

// Dev item 14 — three-group between-subjects user study.
//   A_traditional   — docs + spreadsheet RE toolkit
//   B_unconstrained_llm — free-form LLM chat
//   C_modrik        — this platform
// Anonymised by design (participantCode only, PDPL-aligned).

const GROUPS = ["A_traditional", "B_unconstrained_llm", "C_modrik"];


// POST { groupId, participantCode, scenarioId, projectId? } → open a session
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid study session payload" }, { status: 400 });
  }
  const groupId = typeof body.groupId === "string" ? body.groupId : "";
  const participantCode = typeof body.participantCode === "string" ? body.participantCode.trim() : "";
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId.trim() : "";
  const projectId = body.projectId === undefined || body.projectId === null || body.projectId === ""
    ? null
    : String(body.projectId);

  if (!GROUPS.includes(groupId)) {
    return NextResponse.json({ error: `groupId must be one of ${GROUPS.join(", ")}` }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(participantCode) || !/^[A-Za-z0-9_.:-]{1,60}$/.test(scenarioId)) {
    return NextResponse.json({ error: "participantCode and scenarioId must use approved anonymised identifiers" }, { status: 400 });
  }
  if (groupId === "C_modrik" && !projectId) {
    return NextResponse.json({ error: "C_modrik sessions must be linked to a project" }, { status: 400 });
  }
  if (groupId !== "C_modrik" && projectId) {
    return NextResponse.json({ error: "Only C_modrik sessions may link to a Modrik project" }, { status: 400 });
  }
  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const issued = issueParticipantToken();
  const session = await db.studySession.create({
    data: {
      groupId,
      participantCode,
      scenarioId,
      projectId,
      participantTokenHash: issued.hash,
      participantTokenExpiresAt: issued.expiresAt,
    },
  });
  // The raw bearer token is returned once to the authenticated moderator.
  // It is never stored or re-exposed by GET/export endpoints.
  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    participantToken: issued.token,
    participantTokenExpiresAt: issued.expiresAt,
    participantEndpoint: "/api/study/respond",
  }, { status: 201 });
}

// PATCH { sessionId, taskTimeSec?, nasaTlx?, susScore?, notes?, event? } → close/log
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = String(body.sessionId ?? "");
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const session = await db.studySession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.finishedAt) return NextResponse.json({ error: "This study session is already finished and locked." }, { status: 409 });

  if (body.event && typeof body.event === "object" && !Array.isArray(body.event)) {
    await db.studyEvent.create({
      data: {
        sessionId,
        kind: /^[a-zA-Z0-9_.:-]{1,40}$/.test(String(body.event.kind ?? "note")) ? String(body.event.kind ?? "note") : "note",
        detail: String(body.event.detail ?? "").slice(0, 600),
      },
    });
  }

  const data: Record<string, unknown> = {};
  if (body.taskTimeSec !== undefined) {
    const value = Number(body.taskTimeSec);
    if (Number.isFinite(value)) data.taskTimeSec = Math.min(7 * 24 * 60 * 60, Math.max(0, Math.round(value)));
  }
  if (body.susScore !== undefined) {
    const value = Number(body.susScore);
    if (Number.isFinite(value)) data.susScore = Math.min(100, Math.max(0, Math.round(value)));
  }
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 2000);
  if (body.nasaTlx && typeof body.nasaTlx === "object") {
    const tlx = body.nasaTlx as Record<string, unknown>;
    const dims = ["mental", "physical", "temporal", "performance", "effort", "frustration"];
    const clean: Record<string, number> = {};
    for (const d of dims) {
      const v = Number(tlx[d]);
      if (Number.isFinite(v)) clean[d] = Math.min(100, Math.max(0, Math.round(v)));
    }
    data.nasaTlx = JSON.stringify(clean);
  }
  if (body.finished !== undefined && typeof body.finished !== "boolean") {
    return NextResponse.json({ error: "finished must be a boolean" }, { status: 400 });
  }
  if (body.finished === true) data.finishedAt = new Date();
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
    ].map(csvCell).join(",");
  });
  const csv = [header, ...rows].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modrik_study_export.csv"',
    },
  });
}
