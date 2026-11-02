import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPasswordResetToken, hashPasswordResetToken, PASSWORD_RESET_TTL_MS } from "@/lib/security/password-reset.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import { consumeRateLimit } from "@/lib/security/rate-limit.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

function genericResponse() {
  return NextResponse.json({ ok: true, message: "If an active account matches that address, recovery instructions will be sent." }, { status: 202, headers: noStore });
}

function configuredBaseUrl() {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!configured || !process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_EMAIL_FROM) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) return null;
    return url;
  } catch { return null; }
}

async function sendRecoveryEmail(email: string, resetUrl: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.PASSWORD_RESET_EMAIL_FROM,
      to: [email],
      subject: "Reset your Modrik password",
      text: `A password reset was requested for your Modrik account. This link expires in 30 minutes and can be used once: ${resetUrl}\n\nIf you did not request this, ignore this message.`,
      html: `<p>A password reset was requested for your Modrik account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This single-use link expires in 30 minutes. If you did not request this, ignore this message.</p>`,
    }),
  });
  return response.ok;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return NextResponse.json({ error: "Cross-origin password recovery rejected" }, { status: 403, headers: noStore });
  }
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415, headers: noStore });
  }
  const base = configuredBaseUrl();
  if (!base) return NextResponse.json({ error: "Password recovery email is not configured" }, { status: 503, headers: noStore });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: noStore });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400, headers: noStore });

  const ip = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
  const ipLimit = await consumeRateLimit({ scope: "password-reset:request:ip", identifier: ip, limit: 10, windowMs: 15 * 60 * 1000 });
  const accountLimit = await consumeRateLimit({ scope: "password-reset:request:account", identifier: email, limit: 3, windowMs: 60 * 60 * 1000 });
  if (!ipLimit.allowed || !accountLimit.allowed) return genericResponse();

  const now = Date.now();
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  if (!user || user.status !== "active") return genericResponse();

  const token = createPasswordResetToken();
  const tokenHash = hashPasswordResetToken(token);
  if (!tokenHash) return genericResponse();
  const expiresAt = new Date(now + PASSWORD_RESET_TTL_MS);
  const record = await db.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date(now) },
    });
    return tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
  });

  const resetUrl = new URL("/reset-password", base);
  resetUrl.searchParams.set("token", token);
  let sent = false;
  try { sent = await sendRecoveryEmail(user.email, resetUrl.toString()); } catch { sent = false; }
  if (!sent) {
    await db.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  return genericResponse();
}
