const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/study/respond",
]);

export function isPublicApiPath(pathname) {
  return typeof pathname === "string" && PUBLIC_API_PATHS.has(pathname);
}
