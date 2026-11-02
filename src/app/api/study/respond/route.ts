import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashParticipantToken, verifyParticipantToken } from "@/lib/study/participant-token.mjs";

export const runtime = "nodejs";

const MAX_REQUESTS_PER_WINDOW = 120;
const WINDOW_MS = 5 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
const DIMENSIONS = ["mental", "physical", "temporal", "performance", "effort", "frustration"] as const;

function response(payload: unknown, status = 200) {
  const result = NextResponse.json(payload, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}

function overLimit(key: string, now: number): boolean {
  if (attempts.size > 4_000) {
    for (const [entryKey, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(entryKey);
    }
    if (attempts.size > 5_000) return true;
  }
  const previous = attempts.get(key);
  if (!previous || previous.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (previous.count >= MAX_REQUESTS_PER_WINDOW) return true;
  previous.count += 1;
  return false;
}

// Public, session-scoped endpoint. It accepts writes only; the moderator
// dashboard, session listing and CSV export remain behind owner authentication.
export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(mps_[A-Za-z0-9_-]{43})$/.exec(authorization);
  if (!match) return response({ error: "A valid participant session bearer token is required." }, 401);

  let tokenHash: string;
  try {
    tokenHash = hashParticipantToken(match[1]);
  } catch {
    return response({ error: "Invalid participant session token." }, 401);
  }

  const now = Date.now();
  if (overLimit(tokenHash, now)) {
    return response({ error: "Too many updates for this participant session. Try again later." }, 429);
  }

  const session = await db.studySession.findUnique({
    where: { participantTokenHash: tokenHash },
    select: {
      id: true,
      participantTokenHash: true,
      participantTokenExpiresAt: true,
      finishedAt: true,
      nasaTlx: true,
    },
  });
  if (!session || !session.participantTokenHash || !session.participantTokenExpiresAt ||
      !verifyParticipantToken(match[1], session.participantTokenHash, session.participantTokenExpiresAt, now)) {
    return response({ error: "Participant session token is invalid or expired." }, 401);
  }
  if (session.finishedAt) {
    return response({ error: "This study session is finished and cannot be changed." }, 409);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "Invalid participant response body." }, 400);
  }

  const data: Record<string, unknown> = {};
  if (body.taskTimeSec !== undefined) {
    const value = Number(body.taskTimeSec);
    if (!Number.isFinite(value) || value < 0 || value > 7 * 24 * 60 * 60) {
      return response({ error: "taskTimeSec must be a finite value from 0 to 604800." }, 400);
    }
    data.taskTimeSec = Math.round(value);
  }

  if (body.susScore !== undefined) {
    const value = Number(body.susScore);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return response({ error: "susScore must be a finite value from 0 to 100." }, 400);
    }
    data.susScore = Math.round(value);
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") return response({ error: "notes must be a string." }, 400);
    data.notes = body.notes.slice(0, 2000);
  }

  if (body.nasaTlx !== undefined) {
    if (!body.nasaTlx || typeof body.nasaTlx !== "object" || Array.isArray(body.nasaTlx)) {
      return response({ error: "nasaTlx must be an object of 0–100 dimension scores." }, 400);
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
    for (const dimension of DIMENSIONS) {
      if (body.nasaTlx[dimension] === undefined) continue;
      const value = Number(body.nasaTlx[dimension]);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return response({ error: "NASA-TLX dimensions must be finite values from 0 to 100." }, 400);
      }
      next[dimension] = Math.round(value);
      changed += 1;
    }
    if (changed === 0) return response({ error: "At least one recognised NASA-TLX dimension is required." }, 400);
    data.nasaTlx = JSON.stringify(next);
  }

  if (body.finished !== undefined && typeof body.finished !== "boolean") {
    return response({ error: "finished must be a boolean." }, 400);
  }
  if (body.finished === true) data.finishedAt = new Date();
  if (Object.keys(data).length === 0 && body.event === undefined) {
    return response({ error: "No supported study update was provided." }, 400);
  }

  let event: { kind: string; detail: string } | null = null;
  if (body.event !== undefined) {
    if (!body.event || typeof body.event !== "object" || Array.isArray(body.event)) {
      return response({ error: "event must be an object." }, 400);
    }
    const kind = String(body.event.kind ?? "note");
    if (!/^[a-zA-Z0-9_.:-]{1,40}$/.test(kind)) {
      return response({ error: "event.kind contains unsupported characters." }, 400);
    }
    if (body.event.detail !== undefined && typeof body.event.detail !== "string") {
      return response({ error: "event.detail must be a string." }, 400);
    }
    event = { kind, detail: String(body.event.detail ?? "").slice(0, 600) };
  }

  const changed = await db.$transaction(async (tx) => {
    // The conditional update prevents a concurrent request from writing after
    // another request has already finished this participant's session.
    const update = await tx.studySession.updateMany({
      where: {
        id: session.id,
        participantTokenHash: tokenHash,
        finishedAt: null,
        participantTokenExpiresAt: { gt: new Date(now) },
      },
      data,
    });
    if (update.count !== 1) return false;
    if (event) {
      await tx.studyEvent.create({
        data: { sessionId: session.id, kind: event.kind, detail: event.detail },
      });
    }
    return true;
  });

  if (!changed) return response({ error: "Study session expired or was already finished." }, 409);
  return response({ ok: true, sessionId: session.id, finished: body.finished === true });
}
