import test from "node:test";
import assert from "node:assert/strict";
import { resolveOrganizationMembership } from "../src/lib/security/organization-selection.mjs";

const org = (id, status = "active") => ({ id, name: id, slug: id, status });
const membership = (id, role = "viewer", status = "active", organizationStatus = "active") => ({
  id: "membership-" + id,
  organizationId: id,
  role,
  status,
  organization: org(id, organizationStatus),
});

test("a single active organization is selected automatically", () => {
  const result = resolveOrganizationMembership([membership("one", "owner")]);
  assert.equal(result.kind, "selected");
  assert.equal(result.membership.organizationId, "one");
  assert.deepEqual(result.organizations.map((item) => item.id), ["one"]);
});

test("multiple active memberships require explicit selection", () => {
  const result = resolveOrganizationMembership([
    membership("one", "owner"),
    membership("two", "engineer"),
  ]);
  assert.equal(result.kind, "selection_required");
  assert.deepEqual(result.organizations.map((item) => item.id), ["one", "two"]);
});

test("an explicitly selected membership must belong to the active membership set", () => {
  assert.equal(resolveOrganizationMembership([membership("one")], "one").kind, "selected");
  assert.equal(resolveOrganizationMembership([membership("one")], "other").kind, "invalid");
});

test("suspended memberships and organizations are never offered or selected", () => {
  const result = resolveOrganizationMembership([
    membership("active"),
    membership("suspended", "viewer", "suspended"),
    membership("closed-org", "viewer", "active", "suspended"),
  ]);
  assert.equal(result.kind, "selected");
  assert.deepEqual(result.organizations.map((item) => item.id), ["active"]);
  assert.equal(resolveOrganizationMembership([membership("suspended", "viewer", "suspended")]).kind, "none");
});
