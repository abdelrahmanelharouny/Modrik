import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "mps_";

export function hashParticipantToken(token) {
  if (typeof token !== "string" || !/^mps_[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new TypeError("Invalid participant session token");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function issueParticipantToken(now = Date.now(), ttlMs = 7 * 24 * 60 * 60 * 1000) {
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("Participant token expiry must be a positive finite duration");
  }
  const token = PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashParticipantToken(token),
    expiresAt: new Date(now + ttlMs),
  };
}

export function verifyParticipantToken(token, expectedHash, expiresAt, now = Date.now()) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now) return false;
  let actual;
  try {
    actual = Buffer.from(hashParticipantToken(token), "hex");
  } catch {
    return false;
  }
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
