import { NextRequest, NextResponse } from "next/server";
import { isPublicApiPath } from "@/lib/security/api-access.mjs";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";

const OPEN_PATHS = new Set(["/login", "/study/participant"]);

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function proxy(request: NextRequest) {
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
  if (!session || !configuredEmail || session.email !== configuredEmail) {
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

  // Cookie sessions must not be usable cross-origin for state-changing calls.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    if ((origin && origin !== request.nextUrl.origin) ||
        (!origin && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
      return NextResponse.json({ error: "Cross-origin state change rejected" }, { status: 403 });
    }
  }

  const response = NextResponse.next();
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
