import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, isSessionSigningConfigured } from "@/lib/security/session.mjs";
import { getPasswordResetState, hashPasswordResetToken } from "@/lib/security/password-reset.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import { consumeRateLimit } from "@/lib/security/rate-limit.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function POST(req: NextRequest) {
  if (!isSessionSigningConfigured()) return jsonError("Authentication is not configured", 503);
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) return jsonError("Cross-origin password reset rejected", 403);
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) return jsonError("Content-Type must be application/json", 415);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request body", 400);
  const token = typeof body.token === "string" ? body.token : "";
  const tokenHash = hashPasswordResetToken(token);

  const ip = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  const ipLimit = await consumeRateLimit({ scope: "password-reset:complete:ip", identifier: ip, limit: 10, windowMs: 15 * 60 * 1000 });
  if (ipLimit.backend === "unavailable") return jsonError("Shared recovery protection is unavailable", 503);
  if (!ipLimit.allowed) return NextResponse.json({ error: "Too many reset attempts. Try again later." }, { status: 429, headers: { ...noStore, "Retry-After": String(ipLimit.retryAfterSeconds) } });
  if (!tokenHash) return jsonError("Password reset link is invalid or expired", 400);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 12 || password.length > 1024) return jsonError("Password must contain between 12 and 1024 characters", 400);

  const reset = await db.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, status: true } } },
  });
  if (!reset || getPasswordResetState(reset) !== "pending" || reset.user.status !== "active") {
    return jsonError("Password reset link is invalid or expired", 400);
  }
  let passwordHash: string;
  try { passwordHash = await hashPassword(password); }
  catch { return jsonError("Could not securely update the password", 500); }

  const now = new Date();
  const changed = await db.$transaction(async (tx) => {
    const claim = await tx.passwordResetToken.updateMany({
      where: { id: reset.id, tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return false;
    const user = await tx.user.updateMany({
      where: { id: reset.userId, status: "active" },
      data: { passwordHash, emailVerifiedAt: now },
    });
    if (user.count !== 1) return false;
    await tx.passwordResetToken.updateMany({
      where: { userId: reset.userId, id: { not: reset.id }, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authSession.updateMany({
      where: { userId: reset.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
  if (!changed) return jsonError("Password reset link is invalid or expired", 409);
  return NextResponse.json({ ok: true, message: "Password updated. Sign in again with your new password." }, { headers: noStore });
}
