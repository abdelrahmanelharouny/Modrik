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
