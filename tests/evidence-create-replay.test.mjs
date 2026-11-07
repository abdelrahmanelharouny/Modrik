import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceCreateReplay } from "../src/lib/evidence/create-replay.mjs";
import { hashEvidenceOperationRequest } from "../src/lib/evidence/operation-hash.mjs";

const normalized = {
  title: "Interview",
  content: "Need Arabic support",
  sourceType: "interview",
  language: "ar-EG",
  consent: false,
};

test("create replay requires the same project, source content and provenance", () => {
  const existing = {
    id: "evidence-1",
    projectId: "project-1",
    origin: "human",
    ...normalized,
  };
  const request = { projectId: "project-1", normalized, origin: "human" };
  assert.equal(isEvidenceCreateReplay(existing, request), true);
  assert.equal(isEvidenceCreateReplay(existing, { ...request, projectId: "project-2" }), false);
  assert.equal(isEvidenceCreateReplay(existing, { ...request, origin: "file" }), false);
  assert.equal(isEvidenceCreateReplay({ ...existing, content: "Different source" }, request), false);
  assert.equal(isEvidenceCreateReplay(null, request), false);
});



test("operation fingerprint binds project, action, provenance and normalized payload", () => {
  const base = { projectId: "project-1", action: "create", origin: "human", normalized };
  const hash = hashEvidenceOperationRequest(base);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hashEvidenceOperationRequest(base), hash);
  assert.notEqual(hashEvidenceOperationRequest({ ...base, projectId: "project-2" }), hash);
  assert.notEqual(hashEvidenceOperationRequest({ ...base, action: "update" }), hash);
  assert.notEqual(hashEvidenceOperationRequest({ ...base, origin: "file" }), hash);
  assert.notEqual(hashEvidenceOperationRequest({ ...base, normalized: { ...normalized, consent: true } }), hash);
  assert.throws(() => hashEvidenceOperationRequest({ ...base, action: "invalid" }), /action/);
});
