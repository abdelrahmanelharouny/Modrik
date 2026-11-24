import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { SESSION_TTL_SECONDS, createIdentitySessionToken, verifySessionToken } from "@/lib/security/session.mjs";
import { canAccessOrganization } from "@/lib/security/organization-access.mjs";

export type IdentityPrincipal = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: string;
  email: string;
  sessionId: string;
  expiresAt: string;
};

export async function createIdentitySession(input: {
  userId: string;
  email: string;
  organizationId: string;
  membershipId: string;
  role: string;
}) {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.authSession.create({
    data: {
      id: sessionId,
      userId: input.userId,
      membershipId: input.membershipId,
      expiresAt,
    },
  });
  const token = createIdentitySessionToken({ ...input, sessionId }, process.env.MODRIK_AUTH_SECRET!);
  return { token, expiresAt, sessionId };
}

export async function resolveIdentitySession(token: string | undefined | null): Promise<IdentityPrincipal | null> {
  const claims = verifySessionToken(token ?? undefined, process.env.MODRIK_AUTH_SECRET);
  if (!claims || claims.type !== "identity" || !claims.sessionId || !claims.userId ||
      !claims.organizationId || !claims.membershipId) return null;

  const session = await db.authSession.findUnique({
    where: { id: claims.sessionId },
    include: {
      user: { select: { id: true, email: true, status: true } },
      membership: { include: { organization: { select: { id: true, status: true } } } },
    },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
  if (session.userId !== claims.userId || session.membershipId !== claims.membershipId) return null;
  if (session.user.id !== claims.userId || session.user.email !== claims.email || session.user.status !== "active") return null;
  const membership = session.membership;
  if (membership.userId !== claims.userId || membership.organizationId !== claims.organizationId ||
      membership.id !== claims.membershipId || membership.role !== claims.role) return null;
  const access = {
    organizationId: membership.organizationId,
    status: membership.status,
    userStatus: session.user.status,
    organizationStatus: membership.organization.status,
  };
  if (!canAccessOrganization(access, claims.organizationId)) return null;

  return {
    userId: session.user.id,
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role,
    email: session.user.email,
    sessionId: session.id,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function switchIdentitySession(identity: IdentityPrincipal, targetOrganizationId: string) {
  if (!targetOrganizationId || targetOrganizationId.length > 128) return null;
  const now = new Date();
  return db.$transaction(async (tx) => {
    const current = await tx.authSession.findFirst({
      where: {
        id: identity.sessionId,
        userId: identity.userId,
        membershipId: identity.membershipId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!current) throw new Error("CURRENT_SESSION_CHANGED");

    const membership = await tx.membership.findFirst({
      where: {
        userId: identity.userId,
        organizationId: targetOrganizationId,
        status: "active",
        user: { status: "active" },
        organization: { status: "active" },
      },
      select: {
        id: true,
        organizationId: true,
        role: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!membership) return null;

    const sessionId = randomBytes(32).toString("hex");
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
    const token = createIdentitySessionToken({
      email: identity.email,
      userId: identity.userId,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      role: membership.role,
      sessionId,
    }, process.env.MODRIK_AUTH_SECRET!);

    await tx.authSession.create({
      data: { id: sessionId, userId: identity.userId, membershipId: membership.id, expiresAt },
    });
    const revoked = await tx.authSession.updateMany({
      where: { id: identity.sessionId, userId: identity.userId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (revoked.count !== 1) throw new Error("CURRENT_SESSION_CHANGED");

    // Preserve both sides of the tenant boundary in the organization audit
    // stream. These records are committed with the session rotation.
    await tx.organizationAuditEvent.create({
      data: {
        organizationId: identity.organizationId,
        actorUserId: identity.userId,
        eventType: "auth.organization_switch_out",
        resourceType: "auth_session",
        resourceId: identity.sessionId,
        summary: "User switched away from this organization",
        metadata: JSON.stringify({
          fromOrganizationId: identity.organizationId,
          toOrganizationId: membership.organizationId,
          replacementSessionId: sessionId,
        }),
      },
    });
    await tx.organizationAuditEvent.create({
      data: {
        organizationId: membership.organizationId,
        actorUserId: identity.userId,
        eventType: "auth.organization_switch_in",
        resourceType: "auth_session",
        resourceId: sessionId,
        summary: "User switched into this organization",
        metadata: JSON.stringify({
          fromOrganizationId: identity.organizationId,
          toOrganizationId: membership.organizationId,
          previousSessionId: identity.sessionId,
        }),
      },
    });

    return {
      token,
      expiresAt,
      sessionId,
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        role: membership.role,
      },
    };
  });
}

export async function revokeIdentitySession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await db.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
