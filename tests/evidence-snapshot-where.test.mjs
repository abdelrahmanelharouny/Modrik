import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceSnapshotWhere } from "../src/lib/evidence/snapshot-where.mjs";

const evidence = {
  id: "evidence-1",
  projectId: "project-1",
  code: "E-12345678",
  title: "Interview",
  sourceType: "interview",
  language: "ar-EG",
  content: "Original notes",
  consent: false,
  origin: "human",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("evidence compare-and-swap predicate includes identity and every mutable source field", () => {
  assert.deepEqual(buildEvidenceSnapshotWhere(evidence), {
    id: "evidence-1",
    projectId: "project-1",
    title: "Interview",
    sourceType: "interview",
    language: "ar-EG",
    content: "Original notes",
    consent: false,
    origin: "human",
  });
});

test("evidence compare-and-swap predicate excludes unrelated metadata", () => {
  const where = buildEvidenceSnapshotWhere(evidence);
  assert.equal("createdAt" in where, false);
  assert.equal("code" in where, false);
});

test("evidence compare-and-swap predicate rejects incomplete snapshots", () => {
  assert.throws(() => buildEvidenceSnapshotWhere(null), /snapshot/);
  assert.throws(() => buildEvidenceSnapshotWhere({ id: "evidence-1" }), /missing projectId/);
});
