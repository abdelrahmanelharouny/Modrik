import { NextRequest, NextResponse } from "next/server";
import {
  isAuthConfigured,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/security/session.mjs";
import { isPublicApiPath } from "@/lib/security/api-access.mjs";

function jsonError(message: string, status: number, code: string) {
  const response = NextResponse.json(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } }
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    return jsonError(
      "Owner authentication is not configured. Set MODRIK_ADMIN_EMAIL, MODRIK_ADMIN_PASSWORD_HASH and a 32-byte MODRIK_AUTH_SECRET before exposing the application.",
      503,
      "AUTH_NOT_CONFIGURED"
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(token, process.env.MODRIK_AUTH_SECRET);
  if (!session) {
    return jsonError("Authentication required. Sign in to access this resource.", 401, "AUTH_REQUIRED");
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
