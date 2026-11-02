import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createIdentitySession } from "@/lib/security/identity";
import {
  verifyPasswordHash,
  isAuthConfigured,
  isSessionSigningConfigured,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyAdminCredentials,
} from "@/lib/security/session.mjs";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientKey(req: NextRequest): string {
  // Prefer the ingress-provided real IP; if unavailable, use the last
  // forwarded hop (normally appended by the trusted reverse proxy).
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return realIp || forwarded?.at(-1) || "unknown";
}

function pruneAttempts(now: number): boolean {
  if (attempts.size < 4_000) return true;
  for (const [key, value] of attempts) {
    if (value.resetAt <= now) attempts.delete(key);
  }
  // Bound memory even if a hostile client rotates source headers.
  return attempts.size < 5_000;
}

export async function POST(req: NextRequest) {
  if (!isSessionSigningConfigured()) {
    return NextResponse.json(
      { error: "Authentication signing is not configured. Set a 32-byte MODRIK_AUTH_SECRET. Bootstrap administrator credentials are only required for first-time owner provisioning." },
      { status: 503 }
    );
  }

  const now = Date.now();
  if (!pruneAttempts(now)) {
    return NextResponse.json({ error: "Login service is temporarily rate-limited. Try again later." }, { status: 429 });
  }
  const key = clientKey(req);
  const previous = attempts.get(key);
  if (previous && previous.resetAt > now && previous.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }
  if (previous && previous.resetAt <= now) attempts.delete(key);

  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.slice(0, 254).trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 1024) : "";
  const configuredOwner = Boolean(process.env.MODRIK_ADMIN_EMAIL?.trim()) &&
    email === process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPasswordValid = configuredOwner && isAuthConfigured() && await verifyAdminCredentials(email, password);
  let user = await db.user.findUnique({ where: { email } });

  if (!user && !bootstrapPasswordValid) {
    const state = attempts.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    state.count += 1;
    attempts.set(key, state);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (user && user.status !== "active") {
    return NextResponse.json({ error: "This account is disabled" }, { status: 403 });
  }
  const passwordValid = user?.passwordHash
    ? await verifyPasswordHash(password, user.passwordHash)
    : bootstrapPasswordValid;
  if (!passwordValid) {
    const state = attempts.get(key) ?? { count: 0, resetAt: now + WINDOW_MS };
    state.count += 1;
    attempts.set(key, state);
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const identity = await db.$transaction(async (tx) => {
    const resolvedUser = user
      ? await tx.user.update({
          where: { id: user.id },
          data: user.passwordHash ? {} : { passwordHash: process.env.MODRIK_ADMIN_PASSWORD_HASH },
        })
      : await tx.user.create({
          data: {
            email,
            displayName: email === process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase() ? "Workspace Owner" : "",
            passwordHash: process.env.MODRIK_ADMIN_PASSWORD_HASH,
            status: "active",
            emailVerifiedAt: new Date(),
          },
        });
    const organization = configuredOwner
      ? await tx.organization.upsert({
          where: { slug: "modrik-default" },
          create: { name: "Modrik Workspace", slug: "modrik-default", status: "active" },
          update: {},
        })
      : await tx.organization.findUnique({ where: { slug: "modrik-default" } });
    if (!organization) throw new Error("ACCOUNT_MEMBERSHIP_INACTIVE");
    const membershipWhere = {
      userId_organizationId: { userId: resolvedUser.id, organizationId: organization.id },
    };
    const membership = configuredOwner && resolvedUser.email === process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase()
      ? await tx.membership.upsert({
          where: membershipWhere,
          create: {
            userId: resolvedUser.id,
            organizationId: organization.id,
            role: "owner",
            status: "active",
            activatedAt: new Date(),
          },
          update: {},
        })
      : await tx.membership.findUnique({ where: membershipWhere });
    if (!membership || membership.status !== "active") {
      throw new Error("ACCOUNT_MEMBERSHIP_INACTIVE");
    }
    // One-time safe adoption of legacy unassigned projects into the bootstrap
    // workspace. Never reassign projects already owned by another tenant.
    if (membership.role === "owner" && configuredOwner) {
      await tx.project.updateMany({
        where: { organizationId: null },
        data: { organizationId: organization.id, createdByUserId: resolvedUser.id },
      });
    }
    return {
      userId: resolvedUser.id,
      email: resolvedUser.email,
      organizationId: organization.id,
      membershipId: membership.id,
      role: membership.role,
    };
  }).catch((error) => {
    if (error instanceof Error && error.message === "ACCOUNT_MEMBERSHIP_INACTIVE") return null;
    throw error;
  });

  if (!identity) {
    return NextResponse.json({ error: "Organization membership is inactive" }, { status: 403 });
  }
  const session = await createIdentitySession(identity);
  attempts.delete(key);
  const response = NextResponse.json({ ok: true });
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
