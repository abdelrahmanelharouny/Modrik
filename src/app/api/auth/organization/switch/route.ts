import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/security/session.mjs";
import { resolveIdentitySession, switchIdentitySession } from "@/lib/security/identity";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return NextResponse.json({ error: "Cross-origin organization switch rejected", code: "CSRF_ORIGIN_REJECTED" }, {
      status: 403, headers: noStore,
    });
  }
  const identity = await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415, headers: noStore });
  }
  const body = await req.json().catch(() => null);
  const organizationId = typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId || organizationId.length > 128) {
    return NextResponse.json({ error: "A valid organizationId is required" }, { status: 400, headers: noStore });
  }
  try {
    const switched = await switchIdentitySession(identity, organizationId);
    if (!switched) {
      return NextResponse.json({ error: "You do not have an active membership in that organization" }, { status: 403, headers: noStore });
    }
    const response = NextResponse.json({
      ok: true,
      organization: switched.organization,
      expiresAt: switched.expiresAt.toISOString(),
    }, { headers: noStore });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: switched.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const currentSessionChanged = error instanceof Error && error.message === "CURRENT_SESSION_CHANGED";
    return NextResponse.json({
      error: currentSessionChanged
        ? "Your session changed. Sign in again before switching organizations."
        : "Organization switch could not be completed. Retry the request.",
    }, { status: currentSessionChanged ? 409 : 503, headers: noStore });
  }
}
