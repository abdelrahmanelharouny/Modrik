import test from "node:test";
import assert from "node:assert/strict";
import {
  createInvitationToken,
  getInvitationState,
  hashInvitationToken,
  INVITABLE_ROLES,
  isInvitableRole,
} from "../src/lib/security/invitations.mjs";

test("invitation tokens are high-entropy base64url values and only hashes are persisted", () => {
  const token = createInvitationToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(hashInvitationToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashInvitationToken(token), token);
  assert.equal(hashInvitationToken(token), hashInvitationToken(token));
  assert.equal(hashInvitationToken("short"), null);
});

test("invitation roles are least-privilege and never allow owner assignment", () => {
  assert.deepEqual(INVITABLE_ROLES, ["admin", "engineer", "reviewer", "approver", "viewer"]);
  assert.equal(isInvitableRole("viewer"), true);
  assert.equal(isInvitableRole("owner"), false);
  assert.equal(isInvitableRole("superadmin"), false);
});

test("invitation state prioritizes terminal states and expires at the exact boundary", () => {
  const now = 1_800_000_000_000;
  assert.equal(getInvitationState({ expiresAt: new Date(now + 1) }, now), "pending");
  assert.equal(getInvitationState({ expiresAt: new Date(now) }, now), "expired");
  assert.equal(getInvitationState({ expiresAt: new Date(now + 1000), revokedAt: new Date(now) }, now), "revoked");
  assert.equal(getInvitationState({ expiresAt: new Date(now + 1000), acceptedAt: new Date(now) }, now), "accepted");
});
