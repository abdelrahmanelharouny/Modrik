import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { resolveIdentitySession } from "@/lib/security/identity";
import { isPublicApiRequest } from "@/lib/security/api-access.mjs";
import { resolveOrganizationRoutePermission } from "@/lib/security/organization-route-access.mjs";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";
import {
  isSessionSigningConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";

const OPEN_PATHS = new Set(["/login", "/invite/accept", "/study/participant"]);

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

function projectPermission(pathname: string, method: string, body?: unknown): string {
  const parts = pathname.slice("/api/projects/".length).split("/");
  const route = parts.slice(1).join("/");
  if (!route) {
    if (method === "GET" || method === "HEAD") return "projects:read";
    if (method === "DELETE") return "projects:delete";
    if (method === "PATCH" || method === "PUT") return "projects:update";
    return "projects:update";
  }
  if (route === "integrations") {
    return method === "GET" ? "projects:read" : "members:manage";
  }
  if (route === "audit/export") {
    return method === "GET" || method === "HEAD" ? "audit:read" : "organization:manage";
  }
  if (route === "stakeholders") {
    if (method === "GET" || method === "HEAD") return "projects:read";
    if (method === "PATCH") {
      const action = body && typeof body === "object" ? String((body as Record<string, unknown>).action ?? "") : "";
      const actionPermissions: Record<string, string> = {
        update_stakeholder: "projects:update",
        respond_negotiation: "requirements:write",
        review_position: "requirements:review",
        decide_negotiation: "requirements:approve",
      };
      return actionPermissions[action] ?? "organization:manage";
    }
    return "requirements:write";
  }
  if (route === "claims" || route === "quality") {
    if (method === "GET" || method === "HEAD") return "projects:read";
    if (method === "PATCH") return "requirements:review";
    return "requirements:write";
  }
  if (route === "compliance" && method !== "GET") return "requirements:review";
  if (route === "drift" && method === "DELETE") return "requirements:review";
  if (method === "GET" || method === "HEAD") return "projects:read";
  return "requirements:write";
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
    return applySecurityHeaders(NextResponse.next());
  }

  if (isApiPath(pathname) && isPublicApiRequest(pathname, request.method)) {
    return applySecurityHeaders(NextResponse.next());
  }

  if (!isSessionSigningConfigured()) {
    if (isApiPath(pathname)) {
      return applySecurityHeaders(NextResponse.json(
        { error: "Modrik authentication is not configured. See SECURITY.md.", code: "AUTH_NOT_CONFIGURED" },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
      ));
    }
    return applySecurityHeaders(NextResponse.redirect(new URL("/login?setup=required", request.url)));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  const configuredEmail = process.env.MODRIK_ADMIN_EMAIL?.trim().toLowerCase();
  const legacyOwner = Boolean(session && session.type === "legacy-owner" && configuredEmail && session.email === configuredEmail);
  const identity = session?.type === "identity" ? await resolveIdentitySession(token) : null;

  if (!legacyOwner && !identity) {
    if (isApiPath(pathname)) {
      return applySecurityHeaders(NextResponse.json(
        { error: "Authentication required", code: "AUTH_REQUIRED" },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
      ));
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
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
        return applySecurityHeaders(NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }));
      }
      const project = await db.project.findUnique({
        where: { id: projectId },
        select: { id: true, organizationId: true },
      });
      if (!project || project.organizationId !== identity.organizationId) {
        return applySecurityHeaders(NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }));
      }
      const permissionBody = pathname.endsWith("/stakeholders") && request.method === "PATCH"
        ? await request.clone().json().catch(() => null)
        : undefined;
      const permission = projectPermission(pathname, request.method, permissionBody);
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
        return applySecurityHeaders(NextResponse.json({ error: "Insufficient organization permission", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }));
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
        return applySecurityHeaders(NextResponse.json({ error: "Insufficient organization permission", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }));
      }
    } else {
      const guardedPermission = resolveOrganizationRoutePermission(pathname, request.method);
      if (!guardedPermission) {
        return applySecurityHeaders(NextResponse.json(
          { error: "API route has no organization permission policy", code: "API_ROUTE_NOT_CLASSIFIED" },
          { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
        ));
      }
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
      }, guardedPermission)) {
        return applySecurityHeaders(NextResponse.json({ error: "Insufficient organization permission", code: "FORBIDDEN" }, { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }));
      }
    }
  }
  // Cookie sessions must not be usable cross-origin for state-changing calls.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    if (!isSameOriginMutation(request.headers, request.nextUrl.protocol)) {
      return applySecurityHeaders(NextResponse.json(
        { error: "Cross-origin state change rejected", code: "CSRF_ORIGIN_REJECTED" },
        { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
      ));
    }
  }

  const response = NextResponse.next({ request: { headers: forwardedHeaders } });
  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
