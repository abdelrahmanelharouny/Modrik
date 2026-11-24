import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createIdentitySession } from "@/lib/security/identity";
import { resolveOrganizationMembership } from "@/lib/security/organization-selection.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import { consumeRateLimit } from "@/lib/security/rate-limit.mjs";
import {
  verifyPasswordHash,
  isAuthConfigured,
  isSessionSigningConfigured,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyAdminCredentials,
} from "@/lib/security/session.mjs";

export const runtime = "nodejs";

function clientKey(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean);
  return realIp || forwarded?.at(-1) || "unknown";
}

function rateLimited(result: { retryAfterSeconds: number; backend: string }) {
  if (result.backend === "unavailable") {
    return NextResponse.json({ error: "Shared authentication protection is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  return NextResponse.json(
    { error: "Too many authentication attempts. Try again later." },
    { status: 429, headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": String(result.retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return NextResponse.json({ error: "Cross-origin login rejected", code: "CSRF_ORIGIN_REJECTED" }, {
      status: 403, headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
  if (!isSessionSigningConfigured()) {
    return NextResponse.json(
      { error: "Authentication signing is not configured. Set a 32-byte MODRIK_AUTH_SECRET. Bootstrap administrator credentials are only required for first-time owner provisioning." },
      { status: 503 }
    );
  }

  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email = typeof body?.email === "string" ? body.email.slice(0, 254).trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password.slice(0, 1024) : "";
  const requestedOrganizationId = body.organizationId === undefined
    ? null
    : typeof body.organizationId === "string" && body.organizationId.trim().length <= 128
      ? body.organizationId.trim()
      : undefined;
  if (requestedOrganizationId === undefined) {
    return NextResponse.json({ error: "organizationId must be a valid organization identifier" }, { status: 400 });
  }

  const ip = clientKey(req);
  const ipLimit = await consumeRateLimit({ scope: "auth:login:ip", identifier: ip, limit: 5, windowMs: 15 * 60 * 1000 });
  if (!ipLimit.allowed) return rateLimited(ipLimit);
  if (email) {
    const accountLimit = await consumeRateLimit({ scope: "auth:login:account", identifier: email, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!accountLimit.allowed) return rateLimited(accountLimit);
  }
  const configuredOwner = Boolean(process.env.MODRIK_ADMIN_EMAIL?.trim()) &&
    email === process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPasswordValid = configuredOwner && isAuthConfigured() && await verifyAdminCredentials(email, password);
  let user = await db.user.findUnique({ where: { email } });

  if (!user && !bootstrapPasswordValid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  if (user && user.status !== "active") {
    return NextResponse.json({ error: "This account is disabled" }, { status: 403 });
  }
  const passwordValid = user?.passwordHash
    ? await verifyPasswordHash(password, user.passwordHash)
    : bootstrapPasswordValid;
  if (!passwordValid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  const provisioned = await db.$transaction(async (tx) => {
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

    // Bootstrap only the configured owner workspace. Ordinary accounts resolve
    // all of their own active memberships instead of being pinned to one slug.
    if (configuredOwner && resolvedUser.email === process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase()) {
      const organization = await tx.organization.upsert({
        where: { slug: "modrik-default" },
        create: { name: "Modrik Workspace", slug: "modrik-default", status: "active" },
        update: {},
      });
      const ownerMembership = await tx.membership.upsert({
        where: { userId_organizationId: { userId: resolvedUser.id, organizationId: organization.id } },
        create: {
          userId: resolvedUser.id, organizationId: organization.id, role: "owner",
          status: "active", activatedAt: new Date(),
        },
        update: {},
      });
      if (ownerMembership.status !== "active") throw new Error("ACCOUNT_MEMBERSHIP_INACTIVE");

      // One-time safe adoption of legacy unassigned projects into the bootstrap
      // workspace. Projects already assigned to another tenant are never moved.
      await tx.project.updateMany({
        where: { organizationId: null },
        data: { organizationId: organization.id, createdByUserId: resolvedUser.id },
      });
    }

    const memberships = await tx.membership.findMany({
      where: {
        userId: resolvedUser.id,
        status: "active",
        organization: { status: "active" },
      },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { organization: { name: "asc" } },
    });

    return { userId: resolvedUser.id, email: resolvedUser.email, memberships };
  }).catch((error) => {
    if (error instanceof Error && error.message === "ACCOUNT_MEMBERSHIP_INACTIVE") return null;
    throw error;
  });

  if (!provisioned) {
    return NextResponse.json({ error: "Organization membership is inactive" }, { status: 403 });
  }

  const selection = resolveOrganizationMembership(provisioned.memberships, requestedOrganizationId);
  if (selection.kind === "none") {
    return NextResponse.json({ error: "No active organization membership is available" }, { status: 403 });
  }
  if (selection.kind === "invalid") {
    return NextResponse.json({ error: "You do not have an active membership in that organization" }, { status: 403 });
  }
  if (selection.kind === "selection_required") {
    return NextResponse.json({
      error: "Choose the organization you want to open.",
      requiresOrganizationSelection: true,
      organizations: selection.organizations,
    }, { status: 409, headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  const identity = {
    userId: provisioned.userId,
    email: provisioned.email,
    organizationId: selection.membership.organizationId,
    membershipId: selection.membership.id,
    role: selection.membership.role,
  };

  const session = await createIdentitySession(identity);
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
