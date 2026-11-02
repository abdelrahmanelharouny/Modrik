import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";
import { isPublicApiPath } from "@/lib/security/api-access.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";

const OPEN_PATHS = new Set(["/login", "/study/participant"]);

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    OPEN_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  if (isApiPath(pathname) && isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Modrik authentication is not configured. See SECURITY.md.", code: "AUTH_NOT_CONFIGURED" },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    return NextResponse.redirect(new URL("/login?setup=required", request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  const configuredEmail = process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  const legacyOwner = Boolean(session && session.type === "legacy-owner" && configuredEmail && session.email === configuredEmail);
  const identity = session?.type === "identity" ? await resolveIdentitySession(token) : null;

  if (!legacyOwner && !identity) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const forwardedHeaders = new Headers(request.headers);
  // Never trust caller-supplied identity context headers.
  for (const header of ["x-modrik-user-id", "x-modrik-organization-id", "x-modrik-membership-id", "x-modrik-role"]) {
    forwardedHeaders.delete(header);
  }
  if (identity) {
    forwardedHeaders.set("x-modrik-user-id", identity.userId);
    forwardedHeaders.set("x-modrik-organization-id", identity.organizationId);
    forwardedHeaders.set("x-modrik-membership-id", identity.membershipId);
    forwardedHeaders.set("x-modrik-role", identity.role);

    if (pathname.startsWith("/api/projects/")) {
      const projectId = decodeURIComponent(pathname.slice("/api/projects/".length).split("/")[0] ?? "");
      if (!projectId) {
        return NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, organizationId: true },
      });
      if (!project || project.organizationId !== identity.organizationId) {
        return NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } });
      }
      const permission = request.method === "GET" || request.method === "HEAD"
        ? "projects:read"
        : request.method === "DELETE"
          ? "projects:delete"
          : request.method === "PATCH" || request.method === "PUT"
            ? "projects:update"
            : "requirements:write";
      const membership = await db.membership.findUnique({
        where: { id: identity.membershipId },
        select: {
          organizationId: true, role: true, status: true,
          user: { select: { status: true } },
          organization: { select: { status: true } },
        },
      });
      if (!membership || !hasOrganizationPermission({
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
        userStatus: membership.user.status,
        organizationStatus: membership.organization.status,
      }, permission)) {
        return NextResponse.json({ error: "Insufficient organization permission", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
      }
    } else if (pathname === "/api/projects") {
      const permission = request.method === "GET" ? "projects:read" : "projects:create";
      const membership = await db.membership.findUnique({
        where: { id: identity.membershipId },
        select: {
          organizationId: true, role: true, status: true,
          user: { select: { status: true } },
          organization: { select: { status: true } },
        },
      });
      if (!membership || !hasOrganizationPermission({
        organizationId: membership.organizationId,
        role: membership.role,
        status: membership.status,
        userStatus: membership.user.status,
        organizationStatus: membership.organization.status,
      }, permission)) {
        return NextResponse.json({ error: "Insufficient organization permission", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } });
      }
    }
  }
  // Cookie sessions must not be usable cross-origin for state-changing calls.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!isSameOriginMutation(request.headers, request.nextUrl.protocol)) {
      return NextResponse.json(
        { error: "Cross-origin state change rejected", code: "CSRF_ORIGIN_REJECTED" },
        { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
  }

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
