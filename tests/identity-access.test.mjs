import test from "node:test";
import assert from "node:assert/strict";
import {
  ORGANIZATION_ROLES,
  MEMBERSHIP_STATUSES,
  normalizeEmail,
  isOrganizationRole,
  isMembershipStatus,
  hasOrganizationPermission,
  canAccessOrganization,
} from "../src/lib/security/organization-access.mjs";

const active = (role, extra = {}) => ({
  organizationId: "org_1",
  role,
  status: "active",
  userStatus: "active",
  organizationStatus: "active",
  ...extra,
});

test("identity vocabularies are explicit and reject unknown values", () => {
  assert.deepEqual(ORGANIZATION_ROLES, ["owner", "admin", "engineer", "reviewer", "approver", "viewer"]);
  assert.deepEqual(MEMBERSHIP_STATUSES, ["invited", "active", "suspended", "revoked"]);
  assert.equal(isOrganizationRole("owner"), true);
  assert.equal(isOrganizationRole("stakeholder"), false);
  assert.equal(isMembershipStatus("active"), true);
  assert.equal(isMembershipStatus("pending"), false);
});

test("email normalization is deterministic and defensive", () => {
  assert.equal(normalizeEmail("  Owner@Example.COM "), "owner@example.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail({}), "");
});

test("only owners control organization settings while admins manage members", () => {
  for (const role of ["owner", "admin"]) {
    assert.equal(hasOrganizationPermission(active(role), "members:manage"), true);
    assert.equal(hasOrganizationPermission(active(role), "organization:manage"), role === "owner");
    assert.equal(hasOrganizationPermission(active(role), "projects:delete"), true);
  }
});

test("engineering, review, approval and viewer permissions are separated", () => {
  assert.equal(hasOrganizationPermission(active("engineer"), "requirements:write"), true);
  assert.equal(hasOrganizationPermission(active("engineer"), "requirements:approve"), false);
  assert.equal(hasOrganizationPermission(active("reviewer"), "requirements:review"), true);
  assert.equal(hasOrganizationPermission(active("reviewer"), "requirements:approve"), false);
  assert.equal(hasOrganizationPermission(active("approver"), "requirements:approve"), true);
  assert.equal(hasOrganizationPermission(active("approver"), "requirements:write"), false);
  assert.equal(hasOrganizationPermission(active("viewer"), "requirements:read"), true);
  assert.equal(hasOrganizationPermission(active("viewer"), "requirements:write"), false);
  assert.equal(hasOrganizationPermission(active("viewer"), "audit:read"), false);
});

test("inactive memberships and disabled principals fail closed", () => {
  assert.equal(hasOrganizationPermission(active("owner", { status: "invited" }), "projects:read"), false);
  assert.equal(hasOrganizationPermission(active("owner", { status: "revoked" }), "projects:read"), false);
  assert.equal(hasOrganizationPermission(active("owner", { userStatus: "disabled" }), "projects:read"), false);
  assert.equal(hasOrganizationPermission(active("owner", { organizationStatus: "suspended" }), "projects:read"), false);
  assert.equal(hasOrganizationPermission(active("unknown"), "projects:read"), false);
  assert.equal(hasOrganizationPermission(null, "projects:read"), false);
  assert.equal(hasOrganizationPermission(active("owner"), "root:everything"), false);
  assert.equal(hasOrganizationPermission({ role: "owner", status: "active" }, "projects:read"), false);
});

test("organization access is tenant-bound and rejects mismatched IDs", () => {
  assert.equal(canAccessOrganization(active("viewer"), "org_1"), true);
  assert.equal(canAccessOrganization(active("viewer"), "org_2"), false);
  assert.equal(canAccessOrganization(active("viewer", { status: "revoked" }), "org_1"), false);
  assert.equal(canAccessOrganization(active("viewer", { organizationStatus: "suspended" }), "org_1"), false);
  assert.equal(canAccessOrganization(active("viewer"), ""), false);
  assert.equal(canAccessOrganization({ organizationId: "org_1", status: "active" }, "org_1"), false);
});
