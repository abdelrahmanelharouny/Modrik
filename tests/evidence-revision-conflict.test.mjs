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
