import { NextRequest, NextResponse } from "next/server";
import {
  isSessionSigningConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isSessionSigningConfigured()) {
    return NextResponse.json(
      { configured: false, authenticated: false },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const identity = await resolveIdentitySession(token);
  if (identity) {
    const memberships = await db.membership.findMany({
      where: {
        userId: identity.userId,
        status: "active",
        organization: { status: "active" },
      },
      select: {
        organizationId: true,
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { organization: { name: "asc" } },
    });
    return NextResponse.json(
      {
        configured: true,
        authenticated: true,
        email: identity.email,
        role: identity.role,
        organizationId: identity.organizationId,
        organizations: memberships.map((membership) => ({
          id: membership.organizationId,
          name: membership.organization.name,
          slug: membership.organization.slug,
          role: membership.role,
        })),
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
