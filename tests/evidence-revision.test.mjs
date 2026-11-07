import test from "node:test";
import assert from "node:assert/strict";
import { hashEvidenceRevision, sameEvidenceRevision } from "../src/lib/evidence/revision.mjs";

const baseline = {
  title: "Stakeholder interview",
  content: "The service must support Arabic.",
  sourceType: "interview",
  language: "ar-EG",
  consent: true,
};

test("revision hashes are deterministic regardless of input property order", () => {
  const reordered = {
    consent: true,
    language: "ar-EG",
    content: "The service must support Arabic.",
    sourceType: "interview",
    title: "Stakeholder interview",
  };
  assert.equal(hashEvidenceRevision(baseline), hashEvidenceRevision(reordered));
});

test("any evidence-bearing field change produces a different revision hash", () => {
  for (const patch of [
    { title: "Updated interview" },
    { content: "The service must support Arabic and English." },
    { sourceType: "meeting" },
    { language: "codeswitch" },
    { consent: false },
  ]) {
    assert.notEqual(hashEvidenceRevision(baseline), hashEvidenceRevision({ ...baseline, ...patch }));
  }
});

test("sameEvidenceRevision compares canonical evidence snapshots", () => {
  assert.equal(sameEvidenceRevision(baseline, { ...baseline }), true);
  assert.equal(sameEvidenceRevision(baseline, { ...baseline, consent: false }), false);
});
