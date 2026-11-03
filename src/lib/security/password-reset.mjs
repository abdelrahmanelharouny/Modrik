import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function createPasswordResetToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPasswordResetToken(token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getPasswordResetState(record, now = Date.now()) {
  if (!record || typeof record !== "object") return "invalid";
  if (record.usedAt) return "used";
  if (record.revokedAt) return "revoked";
  const expiry = record.expiresAt instanceof Date ? record.expiresAt.getTime() : new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now) return "expired";
  return "pending";
}
