import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyAdminCredentials,
} from "@/lib/security/session.mjs";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientKey(req: NextRequest): string {
  // Prefer the ingress-provided real IP; if unavailable, use the last
  // forwarded hop (normally appended by the trusted reverse proxy).
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return realIp || forwarded?.at(-1) || "unknown";
}

function pruneAttempts(now: number): boolean {
  if (attempts.size < 4_000) return true;
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  // Bound memory even if a hostile client rotates source headers.
  return attempts.size < 5_000;
}

export async function POST(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured. Set MODRIK_ADMIN_EMAIL, MODRIK_ADMIN_PASSWORD_HASH and a 32-byte MODRIK_AUTH_SECRET." },
      { status: 503 }
    );
  }

  const now = Date.now();
  if (!pruneAttempts(now)) {
    return NextResponse.json({ error: "Login service is temporarily rate-limited. Try again later." }, { status: 429 });
  }
  const key = clientKey(req);
  const previous = attempts.get(key);
  if (previous && previous.resetAt > now && previous.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }
  if (previous && previous.resetAt <= now) attempts.delete(key);

  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.slice(0, 254) : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 1024) : "";
  const valid = await verifyAdminCredentials(email, password);

  if (!valid) {
    const state = attempts.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    state.count += 1;
    attempts.set(key, state);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  attempts.delete(key);
  const token = createSessionToken(email, process.env.MODRIK_AUTH_SECRET!);
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
