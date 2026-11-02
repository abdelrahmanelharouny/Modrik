import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createIdentitySession } from "@/lib/security/identity";
import { hashPassword, isSessionSigningConfigured, SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/security/session.mjs";
import { hashInvitationToken, getInvitationState } from "@/lib/security/invitations.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!isSessionSigningConfigured()) return jsonError("Authentication is not configured", 503);
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return jsonError("Cross-origin invitation acceptance rejected", 403);
  }
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request body", 400);
  const token = typeof body.token === "string" ? body.token : "";
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash) return jsonError("Invitation is invalid or no longer available", 400);

  const invitation = await db.organizationInvitation.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, status: true, passwordHash: true, displayName: true } },
      organization: { select: { id: true, status: true } },
    },
  });
  if (!invitation || getInvitationState(invitation) !== "pending" ||
      invitation.organization.status !== "active" || invitation.user.status !== "active") {
    return jsonError("Invitation is invalid or no longer available", 400);
  }

  let passwordHash: string | undefined;
  if (!invitation.user.passwordHash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12 || password.length > 1024) {
      return jsonError("Set a password containing at least 12 characters", 400);
    }
    try {
      passwordHash = await hashPassword(password);
    } catch {
      return jsonError("Could not securely set the account password", 500);
    }
  }
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const now = new Date();

  const accepted = await db.$transaction(async (tx) => {
    const currentUser = await tx.user.findUnique({
      where: { id: invitation.userId },
      select: { status: true, passwordHash: true, displayName: true },
    });
    const currentOrganization = await tx.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { status: true },
    });
    if (!currentUser || currentUser.status !== "active" || !currentOrganization || currentOrganization.status !== "active") return null;
    if (passwordHash && currentUser.passwordHash) return null;
    if (!passwordHash && !currentUser.passwordHash) return null;
    const claim = await tx.organizationInvitation.updateMany({
      where: {
        id: invitation.id, tokenHash, acceptedAt: null, revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (claim.count !== 1) return null;

    if (passwordHash) {
      const passwordSet = await tx.user.updateMany({
        where: { id: invitation.userId, status: "active", passwordHash: null },
        data: { passwordHash, ...(displayName ? { displayName } : {}) },
      });
      if (passwordSet.count !== 1) throw new Error("INVITATION_ACCOUNT_CHANGED");
    } else if (displayName && !currentUser.displayName) {
      await tx.user.updateMany({
        where: { id: invitation.userId, status: "active", passwordHash: { not: null } },
        data: { displayName },
      });
    }

    const membership = await tx.membership.updateMany({
      where: {
        userId: invitation.userId,
        organizationId: invitation.organizationId,
        status: "invited",
      },
      data: { role: invitation.role, status: "active", activatedAt: now },
    });
    if (membership.count !== 1) throw new Error("INVITATION_MEMBERSHIP_NOT_PENDING");
    return {
      userId: invitation.userId,
      email: invitation.user.email,
      organizationId: invitation.organizationId,
      role: invitation.role,
    };
  }).catch((error) => {
    if (error instanceof Error && ["INVITATION_MEMBERSHIP_NOT_PENDING", "INVITATION_ACCOUNT_CHANGED"].includes(error.message)) return null;
    throw error;
  });

  if (!accepted) return jsonError("Invitation is invalid or no longer available", 409);
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId: accepted.userId, organizationId: accepted.organizationId } },
    select: { id: true, role: true },
  });
  if (!membership) return jsonError("Invitation could not activate membership", 500);
  const session = await createIdentitySession({
    userId: accepted.userId,
    email: accepted.email,
    organizationId: accepted.organizationId,
    membershipId: membership.id,
    role: membership.role,
  });
  const response = NextResponse.json({ ok: true, email: accepted.email, role: accepted.role }, { headers: noStore });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
