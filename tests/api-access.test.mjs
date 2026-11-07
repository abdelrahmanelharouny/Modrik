import test from "node:test";
import assert from "node:assert/strict";
import { isPublicApiPath } from "../src/lib/security/api-access.mjs";

test("only explicit credential and participant-token endpoints bypass owner auth", () => {
  assert.equal(isPublicApiPath("/api/auth/login"), true);
  assert.equal(isPublicApiPath("/api/auth/logout"), true);
  assert.equal(isPublicApiPath("/api/auth/session"), true);
  assert.equal(isPublicApiPath("/api/study/respond"), true);
  assert.equal(isPublicApiPath("/api/projects"), false);
  assert.equal(isPublicApiPath("/api/projects/demo"), false);
  assert.equal(isPublicApiPath("/api/study"), false);
  assert.equal(isPublicApiPath("/api/telemetry"), false);
  assert.equal(isPublicApiPath("/api/transcribe"), false);
  assert.equal(isPublicApiPath("/api/auth/anything-else"), false);
});
