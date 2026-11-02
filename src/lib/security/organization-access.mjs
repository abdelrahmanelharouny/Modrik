export const ORGANIZATION_ROLES = Object.freeze([
  "owner",
  "admin",
  "engineer",
  "reviewer",
  "approver",
  "viewer",
]);

export const MEMBERSHIP_STATUSES = Object.freeze([
  "invited",
  "active",
  "suspended",
  "revoked",
]);

const ROLE_PERMISSIONS = Object.freeze({
  owner: new Set([
    "organization:read", "organization:manage",
    "members:read", "members:manage",
    "projects:create", "projects:read", "projects:update", "projects:delete",
    "requirements:read", "requirements:write", "requirements:review", "requirements:approve",
    "audit:read",
  ]),
  admin: new Set([
    "organization:read", "organization:manage",
    "members:read", "members:manage",
    "projects:create", "projects:read", "projects:update", "projects:delete",
    "requirements:read", "requirements:write", "requirements:review", "requirements:approve",
    "audit:read",
  ]),
  engineer: new Set([
    "organization:read", "members:read",
    "projects:create", "projects:read", "projects:update",
    "requirements:read", "requirements:write",
  ]),
  reviewer: new Set([
    "organization:read", "members:read", "projects:read",
    "requirements:read", "requirements:review", "audit:read",
  ]),
  approver: new Set([
    "organization:read", "members:read", "projects:read",
    "requirements:read", "requirements:approve", "audit:read",
  ]),
  viewer: new Set([
    "organization:read", "members:read", "projects:read", "requirements:read",
  ]),
});

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function isOrganizationRole(role) {
  return typeof role === "string" && ORGANIZATION_ROLES.includes(role);
}

export function isMembershipStatus(status) {
  return typeof status === "string" && MEMBERSHIP_STATUSES.includes(status);
}

/**
 * Evaluate an already-loaded membership snapshot. Callers must load the
 * membership by both userId and organizationId from trusted session context.
 * This helper does not replace resource-level authorization in route handlers.
 */
export function hasOrganizationPermission(membership, permission) {
  if (!membership || typeof membership !== "object") return false;
  if (membership.status !== "active") return false;
  if (membership.userStatus !== "active") return false;
  if (membership.organizationStatus !== "active") return false;
  if (!isOrganizationRole(membership.role)) return false;
  if (typeof permission !== "string" || !permission) return false;
  return ROLE_PERMISSIONS[membership.role].has(permission);
}

export function canAccessOrganization(membership, organizationId) {
  return Boolean(
    membership &&
    membership.status === "active" &&
    membership.userStatus === "active" &&
    membership.organizationStatus === "active" &&
    typeof organizationId === "string" &&
    organizationId.length > 0 &&
    membership.organizationId === organizationId
  );
}
