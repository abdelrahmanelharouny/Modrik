import { NextRequest, NextResponse } from "next/server";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { configured: false, authenticated: false },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const identity = await resolveIdentitySession(token);
  if (identity) {
    return NextResponse.json(
      {
        configured: true,
        authenticated: true,
        email: identity.email,
        role: identity.role,
        organizationId: identity.organizationId,
        expiresAt: identity.expiresAt,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  const signedSession = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  const configuredEmail = process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  if (signedSession?.type === "legacy-owner" && configuredEmail && signedSession.email === configuredEmail) {
    return NextResponse.json(
      { configured: true, authenticated: true, email: signedSession.email, role: "owner", expiresAt: new Date(signedSession.expiresAt * 1000).toISOString() },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  return NextResponse.json(
    { configured: true, authenticated: false },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
