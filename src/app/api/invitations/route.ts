import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/security/organization-access.mjs";
import { createInvitationToken, hashInvitationToken, isInvitableRole, INVITATION_TTL_MS } from "@/lib/security/invitations.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import { consumeRateLimit } from "@/lib/security/rate-limit.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function GET(req: NextRequest) {
  const organizationId = req.headers.get("x-modrik-organization-id");
  if (!organizationId) return jsonError("Organization context required", 403);
  const invitations = await db.organizationInvitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, email: true, role: true, expiresAt: true,
      acceptedAt: true, revokedAt: true, createdAt: true,
      user: { select: { status: true } },
    },
  });
  const now = Date.now();
  return NextResponse.json({
    invitations: invitations.map((invitation) => ({
      ...invitation,
      status: invitation.acceptedAt ? "accepted"
        : invitation.revokedAt ? "revoked"
        : invitation.expiresAt.getTime() <= now ? "expired" : "pending",
    })),
  }, { headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return jsonError("Cross-origin invitation rejected", 403);
  }
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }
  const organizationId = req.headers.get("x-modrik-organization-id");
  const invitedByUserId = req.headers.get("x-modrik-user-id");
  if (!organizationId || !invitedByUserId) return jsonError("Organization identity required", 403);

  const invitationLimit = await consumeRateLimit({
    scope: "invitation:create:member",
    identifier: `${organizationId}:${invitedByUserId}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!invitationLimit.allowed) {
    return NextResponse.json({ error: "Invitation creation is temporarily rate-limited" }, {
      status: 429, headers: { ...noStore, "Retry-After": String(invitationLimit.retryAfterSeconds) },
    });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request body", 400);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const role = typeof body.role === "string" ? body.role : "viewer";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError("A valid email address is required", 400);
  }
  if (!isInvitableRole(role)) return jsonError("The selected role cannot be assigned by invitation", 400);

  const configuredBase = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  let base: URL;
  try {
    base = configuredBase ? new URL(configuredBase) : new URL(req.url);
    if (base.username || base.password || (process.env.NODE_ENV === "production" && base.protocol !== "https:")) {
      throw new Error("Unsafe invitation base URL");
    }
  } catch {
    return jsonError("A safe application base URL is not configured", 500);
  }
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash) return jsonError("Could not create invitation token", 500);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  const result = await db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, status: true },
    });
    if (!organization || organization.status !== "active") throw new Error("ORGANIZATION_UNAVAILABLE");

    const user = await tx.user.upsert({
      where: { email },
      create: { email, displayName: "", status: "active" },
      update: {},
    });
    if (user.status !== "active") throw new Error("ACCOUNT_DISABLED");

    const existingMembership = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (existingMembership?.status === "active") throw new Error("ALREADY_MEMBER");
    if (existingMembership?.status === "suspended") throw new Error("MEMBERSHIP_SUSPENDED");
    if (existingMembership && !["invited", "revoked"].includes(existingMembership.status)) throw new Error("MEMBERSHIP_UNAVAILABLE");
    if (existingMembership?.status === "revoked") {
      await tx.authSession.updateMany({
        where: { membershipId: existingMembership.id, revokedAt: null },
        data: { revokedAt: now },
      });
    }

    await tx.organizationInvitation.updateMany({
      where: { organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const membership = await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId } },
      create: {
        userId: user.id, organizationId, role, status: "invited",
        invitedAt: now, activatedAt: null,
      },
      update: { role, status: "invited", invitedAt: now, activatedAt: null },
    });
    const invitation = await tx.organizationInvitation.create({
      data: {
        organizationId, userId: user.id, invitedByUserId,
        email, role, tokenHash, expiresAt,
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
    return { invitation, membershipId: membership.id };
  }).catch((error) => {
    if (!(error instanceof Error)) throw error;
    const statuses: Record<string, number> = {
      ORGANIZATION_UNAVAILABLE: 404,
      ACCOUNT_DISABLED: 409,
      ALREADY_MEMBER: 409,
      MEMBERSHIP_SUSPENDED: 409,
      MEMBERSHIP_UNAVAILABLE: 409,
    };
    const status = statuses[error.message];
    if (!status) throw error;
    return { error: error.message, status };
  });

  if ("error" in result) {
    const messages: Record<string, string> = {
      ORGANIZATION_UNAVAILABLE: "Organization is unavailable",
      ACCOUNT_DISABLED: "The invited account is disabled",
      ALREADY_MEMBER: "This user is already an active organization member",
      MEMBERSHIP_SUSPENDED: "A suspended membership cannot be reactivated by invitation",
      MEMBERSHIP_UNAVAILABLE: "This membership cannot be reactivated by invitation",
    };
    return jsonError(messages[result.error] ?? "Invitation could not be created", result.status);
  }

  const inviteUrl = new URL("/invite/accept", base);
  inviteUrl.searchParams.set("token", token);
  return NextResponse.json({
    invitation: result.invitation,
    inviteUrl: inviteUrl.toString(),
    delivery: "manual",
    warning: "Copy this link now. The raw invitation token is shown only once; no email is sent by this deployment.",
  }, { status: 201, headers: noStore });
}
