const ROUTE_PERMISSIONS = Object.freeze({
  "/api": Object.freeze({ GET: "organization:read", HEAD: "organization:read" }),
  "/api/transcribe": Object.freeze({ POST: "requirements:write" }),
  "/api/missions": Object.freeze({ GET: "projects:read", HEAD: "projects:read", POST: "projects:create" }),
  "/api/demo": Object.freeze({ GET: "projects:read", HEAD: "projects:read", POST: "projects:create" }),
  "/api/telemetry": Object.freeze({ GET: "audit:read", HEAD: "audit:read" }),
  "/api/study": Object.freeze({
    GET: "organization:manage", HEAD: "organization:manage", POST: "organization:manage",
    PATCH: "organization:manage", DELETE: "organization:manage",
  }),
  "/api/self-audit": Object.freeze({ GET: "organization:manage", HEAD: "organization:manage" }),
  "/api/providers": Object.freeze({ GET: "organization:read", HEAD: "organization:read" }),
  "/api/invitations": Object.freeze({ GET: "members:manage", HEAD: "members:manage", POST: "members:manage" }),
  "/api/invitations/revoke": Object.freeze({ POST: "members:manage" }),
  "/api/organizations/knowledge-memory": Object.freeze({ GET: "organization:read", HEAD: "organization:read" }),
});

export function resolveOrganizationRoutePermission(pathname, method) {
  if (typeof pathname !== "string" || typeof method !== "string") return null;
  return ROUTE_PERMISSIONS[pathname]?.[method.toUpperCase()] ?? null;
}

export function isOrganizationRouteClassified(pathname, method) {
  return resolveOrganizationRoutePermission(pathname, method) !== null;
}
