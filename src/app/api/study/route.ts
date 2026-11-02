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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid study update payload" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

  const session = await db.studySession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.finishedAt || session.withdrawnAt) {
    return NextResponse.json({ error: "This study session is already finished or withdrawn." }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (body.taskTimeSec !== undefined) {
    const value = Number(body.taskTimeSec);
    if (!Number.isFinite(value) || value < 0 || value > 7 * 24 * 60 * 60) {
      return NextResponse.json({ error: "taskTimeSec must be a finite value from 0 to 604800" }, { status: 400 });
    }
    data.taskTimeSec = Math.round(value);
  }
  if (body.susScore !== undefined) {
    const value = Number(body.susScore);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return NextResponse.json({ error: "susScore must be a finite value from 0 to 100" }, { status: 400 });
    }
    data.susScore = Math.round(value);
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
    }
    data.notes = body.notes.slice(0, 2000);
  }
  if (body.nasaTlx !== undefined) {
    if (!body.nasaTlx || typeof body.nasaTlx !== "object" || Array.isArray(body.nasaTlx)) {
      return NextResponse.json({ error: "nasaTlx must be an object" }, { status: 400 });
    }
    let previous: Record<string, number> = {};
    if (session.nasaTlx) {
      try {
        previous = JSON.parse(session.nasaTlx) as Record<string, number>;
      } catch {
        previous = {};
      }
    }
    const next = { ...previous };
    let changed = 0;
    for (const dimension of ["mental", "physical", "temporal", "performance", "effort", "frustration"]) {
      if (body.nasaTlx[dimension] === undefined) continue;
      const value = Number(body.nasaTlx[dimension]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return NextResponse.json({ error: "NASA-TLX dimensions must be finite values from 0 to 100" }, { status: 400 });
      }
      next[dimension] = Math.round(value);
      changed += 1;
    }
    if (changed === 0) {
      return NextResponse.json({ error: "At least one recognised NASA-TLX dimension is required" }, { status: 400 });
    }
    data.nasaTlx = JSON.stringify(next);
  }
  if (body.finished !== undefined && typeof body.finished !== "boolean") {
    return NextResponse.json({ error: "finished must be a boolean" }, { status: 400 });
  }
  if (body.finished === true) data.finishedAt = new Date();

  let event: { kind: string; detail: string } | null = null;
  if (body.event !== undefined) {
    if (!body.event || typeof body.event !== "object" || Array.isArray(body.event)) {
      return NextResponse.json({ error: "event must be an object" }, { status: 400 });
    }
    const kind = String(body.event.kind ?? "note");
    if (!/^[a-zA-Z0-9_.:-]{1,40}$/.test(kind)) {
      return NextResponse.json({ error: "event.kind contains unsupported characters" }, { status: 400 });
    }
    if (body.event.detail !== undefined && typeof body.event.detail !== "string") {
      return NextResponse.json({ error: "event.detail must be a string" }, { status: 400 });
    }
    event = { kind, detail: String(body.event.detail ?? "").slice(0, 600) };
  }
  if (Object.keys(data).length === 0 && !event) {
    return NextResponse.json({ error: "No supported study update was provided" }, { status: 400 });
  }

  const changed = await db.$transaction(async (tx) => {
    const update = await tx.studySession.updateMany({
      where: { id: sessionId, finishedAt: null, withdrawnAt: null },
      data,
    });
    if (update.count !== 1) return false;
    if (event) {
      await tx.studyEvent.create({
        data: { sessionId, kind: event.kind, detail: event.detail },
      });
    }
    return true;
  });
  if (!changed) return NextResponse.json({ error: "Study session was closed by another request." }, { status: 409 });
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
