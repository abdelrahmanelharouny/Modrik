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
  "/api/integrations/oauth/:provider/callback": Object.freeze({ GET: "integrations:manage" }),
  "/api/auth/organizations": Object.freeze({ GET: "organization:read", HEAD: "organization:read" }),
  "/api/auth/organization/switch": Object.freeze({ POST: "organization:read" }),
  "/api/invitations": Object.freeze({ GET: "members:manage", HEAD: "members:manage", POST: "members:manage" }),
  "/api/invitations/revoke": Object.freeze({ POST: "members:manage" }),
  "/api/organizations/knowledge-memory": Object.freeze({ GET: "organization:read", HEAD: "organization:read", PATCH: "organization:read" }),
  "/api/organizations/audit": Object.freeze({ GET: "audit:read", HEAD: "audit:read" }),
});

function resolveDynamicOrganizationRoutePermission(pathname, method) {
  const oauthCallback = pathname.match(/^\/api\/integrations\/oauth\/(github|jira)\/callback$/);
  if (oauthCallback && method === "GET") return "integrations:manage";
  return null;
}

export function resolveOrganizationRoutePermission(pathname, method) {
  if (typeof pathname !== "string" || typeof method !== "string") return null;
  const verb = method.toUpperCase();
  return ROUTE_PERMISSIONS[pathname]?.[verb] ??
    resolveDynamicOrganizationRoutePermission(pathname, verb);
}

export function isOrganizationRouteClassified(pathname, method) {
  return resolveOrganizationRoutePermission(pathname, method) !== null;
}
