import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceRevisionVersionConflict } from "../src/lib/evidence/revision-conflict.mjs";

test("recognizes the evidence revision composite unique constraint", () => {
  assert.equal(isEvidenceRevisionVersionConflict({
    code: "P2002",
    meta: { target: ["evidenceId", "version"] },
  }), true);
  assert.equal(isEvidenceRevisionVersionConflict({
    code: "P2002",
    meta: { target: "EvidenceRevision_evidenceId_version_key" },
  }), true);
});

test("does not misclassify unrelated unique constraints as revision conflicts", () => {
  assert.equal(isEvidenceRevisionVersionConflict({
    code: "P2002",
    meta: { target: ["projectId", "code"] },
  }), false);
  assert.equal(isEvidenceRevisionVersionConflict({
    code: "P2002",
    meta: { target: ["email"] },
  }), false);
  assert.equal(isEvidenceRevisionVersionConflict({ code: "P2025" }), false);
  assert.equal(isEvidenceRevisionVersionConflict(null), false);
  assert.equal(isEvidenceRevisionVersionConflict({ code: "P2002" }), false);
});

import { parseExpectedRevisionVersion } from "../src/lib/evidence/revision-conflict.mjs";

test("parses only safe non-negative revision versions", () => {
  assert.equal(parseExpectedRevisionVersion("0"), 0);
  assert.equal(parseExpectedRevisionVersion("12"), 12);
  assert.equal(parseExpectedRevisionVersion(null), null);
  assert.equal(parseExpectedRevisionVersion(""), null);
  assert.equal(parseExpectedRevisionVersion("-1"), null);
  assert.equal(parseExpectedRevisionVersion("01"), null);
  assert.equal(parseExpectedRevisionVersion("1.5"), null);
  assert.equal(parseExpectedRevisionVersion("1e2"), null);
  assert.equal(parseExpectedRevisionVersion("9007199254740992"), null);
});
