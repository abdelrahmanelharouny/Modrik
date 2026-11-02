import { NextRequest, NextResponse } from "next/server";
import {
  isAuthConfigured,
  SESSION_COOKIE,
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
        expiresAt: null,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  return NextResponse.json(
    { configured: true, authenticated: false },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
