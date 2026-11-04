import test from "node:test";
import assert from "node:assert/strict";
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
