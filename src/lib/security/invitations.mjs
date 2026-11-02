import { createHash, randomBytes } from "node:crypto";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITABLE_ROLES = Object.freeze(["admin", "engineer", "reviewer", "approver", "viewer"]);

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isInvitableRole(role) {
  return typeof role === "string" && INVITABLE_ROLES.includes(role);
}

export function getInvitationState(invitation, now = Date.now()) {
  if (!invitation || typeof invitation !== "object") return "invalid";
  if (invitation.acceptedAt) return "accepted";
  if (invitation.revokedAt) return "revoked";
  const expiresAt = invitation.expiresAt instanceof Date
    ? invitation.expiresAt.getTime()
    : new Date(invitation.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return "invalid";
  if (expiresAt <= now) return "expired";
  return "pending";
}
