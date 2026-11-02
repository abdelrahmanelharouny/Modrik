import test from "node:test";
import assert from "node:assert/strict";
import {
  hashParticipantToken,
  issueParticipantToken,
  verifyParticipantToken,
} from "../src/lib/study/participant-token.mjs";

test("participant session tokens are high entropy and stored only as one-way hashes", () => {
  const issued = issueParticipantToken(1_000, 60_000);
  assert.match(issued.token, /^mps_[A-Za-z0-9_-]{43}$/);
  assert.match(issued.hash, /^[a-f0-9]{64}$/);
  assert.notEqual(issued.hash, issued.token);
  assert.equal(hashParticipantToken(issued.token), issued.hash);
});

test("participant session tokens are scoped to one session and expire", () => {
  const first = issueParticipantToken(1_000, 60_000);
  const second = issueParticipantToken(1_000, 60_000);
  assert.equal(verifyParticipantToken(first.token, first.hash, first.expiresAt, 2_000), true);
  assert.equal(verifyParticipantToken(second.token, first.hash, first.expiresAt, 2_000), false);
  assert.equal(verifyParticipantToken(first.token, first.hash, first.expiresAt, 61_001), false);
  assert.equal(verifyParticipantToken("bad", first.hash, first.expiresAt, 2_000), false);
});

test("token helper rejects invalid token expiry parameters", () => {
  assert.throws(() => issueParticipantToken(0, 0));
  assert.throws(() => hashParticipantToken("bad"));
});
