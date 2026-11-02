import { NextRequest, NextResponse } from "next/server";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { configured: false, authenticated: false },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  const configuredEmail = process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  const authenticated = Boolean(session && configuredEmail && session.email === configuredEmail);
  return NextResponse.json(
    authenticated && session
      ? { configured: true, authenticated: true, email: session.email, expiresAt: session.expiresAt }
      : { configured: true, authenticated: false },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
