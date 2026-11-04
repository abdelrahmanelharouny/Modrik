import test from "node:test";
import assert from "node:assert/strict";
import { hasOrganizationPermission } from "../src/lib/security/organization-access.mjs";
import {
  normalizeOrganizationMemoryReason,
  resolveOrganizationMemoryTransition,
} from "../src/lib/knowledge-graph/organization-memory-governance.mjs";

test("proposed knowledge can only be submitted for review by a writer", () => {
  assert.deepEqual(
    resolveOrganizationMemoryTransition("submit_for_review", "proposed"),
    { action: "submit_for_review", from: "proposed", to: "in_review", permission: "requirements:write" },
  );
  assert.equal(resolveOrganizationMemoryTransition("submit_for_review", "accepted"), null);
});

test("reviewers can reject but cannot approve knowledge", () => {
  assert.deepEqual(
    resolveOrganizationMemoryTransition("reject", "in_review"),
    { action: "reject", from: "in_review", to: "rejected", permission: "requirements:review" },
  );
  assert.equal(resolveOrganizationMemoryTransition("approve", "proposed"), null);
});

test("approval requires the dedicated approval permission and an in-review node", () => {
  assert.deepEqual(
    resolveOrganizationMemoryTransition("approve", "in_review"),
    { action: "approve", from: "in_review", to: "accepted", permission: "requirements:approve" },
  );
  assert.equal(resolveOrganizationMemoryTransition("approve", "accepted"), null);
});

test("only accepted or rejected knowledge can be archived by an approver", () => {
  assert.equal(resolveOrganizationMemoryTransition("archive", "accepted").to, "archived");
  assert.equal(resolveOrganizationMemoryTransition("archive", "rejected").to, "archived");
  assert.equal(resolveOrganizationMemoryTransition("archive", "in_review"), null);
});

test("reason normalization is bounded and strips control characters", () => {
  assert.equal(normalizeOrganizationMemoryReason("  reviewed\nwith care  "), "reviewed with care");
  assert.equal(normalizeOrganizationMemoryReason("x".repeat(600)).length, 500);
  assert.equal(normalizeOrganizationMemoryReason(null), "");
});

test("governance permissions keep review and approval roles separate", () => {
  const reviewer = { role: "reviewer", status: "active", userStatus: "active", organizationStatus: "active" };
  const approver = { role: "approver", status: "active", userStatus: "active", organizationStatus: "active" };
  const engineer = { role: "engineer", status: "active", userStatus: "active", organizationStatus: "active" };
  assert.equal(hasOrganizationPermission(reviewer, "requirements:review"), true);
  assert.equal(hasOrganizationPermission(reviewer, "requirements:approve"), false);
  assert.equal(hasOrganizationPermission(approver, "requirements:approve"), true);
  assert.equal(hasOrganizationPermission(approver, "requirements:review"), false);
  assert.equal(hasOrganizationPermission(engineer, "requirements:write"), true);
  assert.equal(hasOrganizationPermission(engineer, "requirements:approve"), false);
});

test("unknown governance actions fail closed", () => {
  assert.equal(resolveOrganizationMemoryTransition("promote_everything", "proposed"), null);
});
