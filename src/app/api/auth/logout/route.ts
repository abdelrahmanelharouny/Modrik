import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/security/session.mjs";
import { revokeIdentitySession } from "@/lib/security/identity";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Cross-origin logout rejected" }, { status: 403 });
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  if (session?.type === "identity") await revokeIdentitySession(session.sessionId);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
