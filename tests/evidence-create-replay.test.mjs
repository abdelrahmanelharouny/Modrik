import test from "node:test";
import assert from "node:assert/strict";
import { isEvidenceCreateReplay } from "../src/lib/evidence/create-replay.mjs";

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


test("idempotency request fingerprint binds project, action, provenance and normalized payload", async () => {
  const { createHash } = await import("node:crypto");
  const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const base = { projectId: "project-1", action: "create", origin: "human", normalized };
  assert.equal(fingerprint(base), fingerprint({ ...base }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, projectId: "project-2" }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, action: "update" }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, origin: "file" }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, normalized: { ...normalized, consent: true } }));
});
