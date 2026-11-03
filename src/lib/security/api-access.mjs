const PUBLIC_API_METHODS = Object.freeze({
  "/api/auth/login": new Set(["POST"]),
  "/api/auth/invitations/accept": new Set(["POST"]),
  "/api/auth/password-reset/request": new Set(["POST"]),
  "/api/auth/password-reset/complete": new Set(["POST"]),
  "/api/auth/logout": new Set(["POST"]),
  "/api/auth/session": new Set(["GET", "HEAD"]),
  "/api/study/respond": new Set(["GET", "POST"]),
});

export function isPublicApiPath(pathname) {
  return typeof pathname === "string" && Object.hasOwn(PUBLIC_API_METHODS, pathname);
}

export function isPublicApiRequest(pathname, method) {
  if (typeof pathname !== "string" || typeof method !== "string") return false;
  return PUBLIC_API_METHODS[pathname]?.has(method.toUpperCase()) ?? false;
}
