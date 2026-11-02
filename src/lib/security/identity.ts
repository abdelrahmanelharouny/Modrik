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
  const claims = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
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

export async function revokeIdentitySession(sessionId: string | null | undefined) {
  if (!sessionId) return;
  await db.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
