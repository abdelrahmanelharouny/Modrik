import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "modrik_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8;

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isSessionSigningConfigured(env = process.env) {
  return Boolean(env.MODRIK_AUTH_SECRET && Buffer.byteLength(env.MODRIK_AUTH_SECRET, "utf8") >= 32);
}

export function isAuthConfigured(env = process.env) {
  return Boolean(
    env.MODRIK_ADMIN_EMAIL?.trim() &&
    env.MODRIK_ADMIN_PASSWORD_HASH?.trim() &&
    env.MODRIK_AUTH_SECRET &&
    Buffer.byteLength(env.MODRIK_AUTH_SECRET, "utf8") >= 32
  );
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 1024) {
    throw new TypeError("Password must contain between 12 and 1024 characters");
  }
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
  return "$scrypt$16384$8$1$" + salt.toString("hex") + "$" + key.toString("hex");
}

export async function verifyPasswordHash(password, passwordHash) {
  const match = /^\$scrypt\$(\d+)\$(\d+)\$(\d+)\$([a-f0-9]{32,128})\$([a-f0-9]{64,128})$/i.exec(
    typeof passwordHash === "string" ? passwordHash : ""
  );
  if (!match) return false;
  const N = Number(match[1]);
  const r = Number(match[2]);
  const p = Number(match[3]);
  if (!Number.isInteger(N) || N < 16384 || N > 131072 || (N & (N - 1)) !== 0) return false;
  if (!Number.isInteger(r) || r < 8 || r > 16 || !Number.isInteger(p) || p < 1 || p > 4) return false;
  try {
    const salt = Buffer.from(match[4], "hex");
    const expected = Buffer.from(match[5], "hex");
    const actual = await scrypt(String(password ?? ""), salt, expected.length, {
      N, r, p, maxmem: 256 * 1024 * 1024,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function verifyAdminCredentials(email, password, env = process.env) {
  if (!isAuthConfigured(env)) return false;
  const expectedEmail = env.MODRIK_ADMIN_EMAIL.trim().toLowerCase();
  if (!safeEqual(String(email ?? "").trim().toLowerCase(), expectedEmail)) return false;
  return verifyPasswordHash(password, env.MODRIK_ADMIN_PASSWORD_HASH);
}

export function createIdentitySessionToken({ email, userId, organizationId, membershipId, role, sessionId }, secret, now = Date.now()) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("MODRIK_AUTH_SECRET must contain at least 32 bytes");
  }
  if (![email, userId, organizationId, membershipId, role, sessionId].every((value) => typeof value === "string" && value.length > 0)) {
    throw new Error("Identity session claims are incomplete");
  }
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    typ: "identity",
    sub: String(email).trim().toLowerCase(),
    userId,
    organizationId,
    membershipId,
    role,
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    jti: sessionId,
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function createSessionToken(email, secret, now = Date.now()) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("MODRIK_AUTH_SECRET must contain at least 32 bytes");
  }
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    sub: String(email).trim().toLowerCase(),
    role: "owner",
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
    jti: randomBytes(16).toString("hex"),
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048 || !secret ||
      Buffer.byteLength(secret, "utf8") < 32) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!safeEqual(parts[1], expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const nowSeconds = Math.floor(now / 1000);
    if (!payload || typeof payload.sub !== "string") return null;
    const legacyOwner = payload.role === "owner" && payload.typ === undefined;
    const identitySession = payload.typ === "identity" &&
      typeof payload.userId === "string" &&
      typeof payload.organizationId === "string" &&
      typeof payload.membershipId === "string" &&
      typeof payload.jti === "string" &&
      ["owner", "admin", "engineer", "reviewer", "approver", "viewer"].includes(payload.role);
    if (!legacyOwner && !identitySession) return null;
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if (payload.iat > nowSeconds + 60 || payload.exp <= nowSeconds) return null;
    if (payload.exp - payload.iat > SESSION_TTL_SECONDS) return null;
    return {
      email: payload.sub,
      role: payload.role,
      expiresAt: payload.exp,
      sessionId: payload.jti ?? null,
      userId: payload.userId ?? null,
      organizationId: payload.organizationId ?? null,
      membershipId: payload.membershipId ?? null,
      type: identitySession ? "identity" : "legacy-owner",
    };
  } catch {
    return null;
  }
}

/**
 * Verify the single configured owner session for server-side API authorization.
 * This intentionally does not pretend stakeholder profile roles are user accounts;
 * organization membership and per-user RBAC require the separate multi-user rollout.
 */
export function verifyAdminRequest(token, env = process.env, now = Date.now()) {
  if (!isAuthConfigured(env)) return null;
  const session = verifySessionToken(token, env.MODRIK_AUTH_SECRET, now);
  const configuredEmail = env.MODRIK_ADMIN_EMAIL.trim().toLowerCase();
  if (!session || session.role !== "owner" || session.email !== configuredEmail) return null;
  return session;
}
