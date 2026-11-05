import test from "node:test";
import assert from "node:assert/strict";
import { resolveTrackerRequirement, summarizeReverseTrace } from "../src/lib/traceability/reverse.mjs";

const requirements = [
  { id: "req-1", refId: "REQ-01" },
  { id: "req-2", refId: "REQ-02" },
];

test("explicit requirement link has precedence over labels and story links", () => {
  const result = resolveTrackerRequirement({ requirementId: "req-2", storyId: "story-1", localLabel: "REQ-01" }, requirements, [{ id: "story-1", requirementId: "req-1" }]);
  assert.equal(result.requirement.id, "req-2");
  assert.equal(result.resolution, "explicit_requirement_link");
});

test("linked user story resolves to its requirement", () => {
  const result = resolveTrackerRequirement({ storyId: "story-1", localLabel: "unrelated" }, requirements, [{ id: "story-1", requirementId: "req-2" }]);
  assert.equal(result.requirement.id, "req-2");
  assert.equal(result.resolution, "linked_user_story");
});

test("only exact stable requirement references resolve", () => {
  assert.equal(resolveTrackerRequirement({ localLabel: "REQ-01" }, requirements).requirement.id, "req-1");
  assert.equal(resolveTrackerRequirement({ localLabel: "REQ-1" }, requirements).resolution, "unmapped");
  assert.equal(resolveTrackerRequirement({ localLabel: "REQ-01 " }, requirements).requirement.id, "req-1");
});

test("unmapped records do not produce fabricated trace links", () => {
  const result = resolveTrackerRequirement({ localLabel: "feature/login" }, requirements);
  assert.equal(result.requirement, null);
  assert.equal(summarizeReverseTrace({ requirement: null }).status, "unmapped");
});

test("reverse trace summary preserves provenance and impact depth", () => {
  const summary = summarizeReverseTrace({
    requirement: requirements[0],
    traceLinks: [{ evidenceCode: "E-123", note: "Interview quote" }],
    claimLinks: [{ claim: { id: "c1", claimRef: "CL-1", status: "accepted", quote: "must be fast", evidence: { code: "E-123" }, revision: { version: 2 } }, relationship: "supports" }],
    knowledgeLinks: [{ node: { id: "n1", nodeRef: "KN-1", kind: "goal", label: "Speed", status: "accepted" }, role: "implements" }],
    stories: [{ id: "s1", refId: "US-1", title: "Fast search", status: "approved" }],
    impacted: [{ id: "r2", refId: "REQ-02", depth: 1, via: [{ from: "REQ-01", kind: "depends_on" }] }],
  });
  assert.equal(summary.direct[0].evidenceCode, "E-123");
  assert.equal(summary.linkedClaims[0].revisionVersion, 2);
  assert.equal(summary.knowledge[0].role, "implements");
  assert.equal(summary.impacted[0].depth, 1);
});


test("reverse impact enrichment preserves affected requirement state and unique evidence coverage", () => {
  const summary = summarizeReverseTrace({
    requirement: requirements[0],
    impacted: [
      { id: "req-2", depth: 1, via: [{ kind: "depends_on" }], requirement: { refId: "REQ-02", text: "Affected requirement", status: "revised", priority: "Must", verifyStatus: "unverified", driftStatus: "changed" }, evidenceCodes: ["E-2", "E-1", "E-2"] },
    ],
  });
  assert.deepEqual(summary.impacted[0], {
    id: "req-2",
    refId: "REQ-02",
    text: "Affected requirement",
    status: "revised",
    priority: "Must",
    verifyStatus: "unverified",
    driftStatus: "changed",
    depth: 1,
    via: [{ kind: "depends_on" }],
    evidenceCodes: ["E-1", "E-2"],
    evidenceCount: 2,
  });
});

test("reverse impact enrichment safely handles missing requirement details", () => {
  const summary = summarizeReverseTrace({ requirement: requirements[0], impacted: [{ id: "req-missing", depth: 2 }] });
  assert.equal(summary.impacted[0].refId, null);
  assert.equal(summary.impacted[0].evidenceCount, 0);
  assert.deepEqual(summary.impacted[0].via, []);
});


test("reverse trace exposes source metadata and latest immutable revision without raw source content", () => {
  const summary = summarizeReverseTrace({
    requirement: requirements[0],
    traceLinks: [{
      evidenceCode: "E-123",
      evidenceId: "evidence-1",
      note: "Interview source",
      evidence: {
        id: "evidence-1", code: "E-123", title: "Customer interview",
        sourceType: "interview", language: "ar-EG", consent: true,
        createdAt: new Date("2026-10-01T10:00:00.000Z"),
        revisions: [{ version: 3, changeNote: "Clarified terminology", createdAt: new Date("2026-10-02T10:00:00.000Z"), createdBy: "human", content: "must never be serialized" }],
      },
    }],
  });
  assert.deepEqual(summary.direct[0].source, {
    id: "evidence-1", code: "E-123", title: "Customer interview",
    sourceType: "interview", language: "ar-EG", consent: true,
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    latestRevision: {
      version: 3, changeNote: "Clarified terminology",
      createdAt: new Date("2026-10-02T10:00:00.000Z"), createdBy: "human",
    },
  });
  assert.equal(JSON.stringify(summary).includes("must never be serialized"), false);
});

test("reverse trace handles deleted evidence sources without inventing source metadata", () => {
  const summary = summarizeReverseTrace({
    requirement: requirements[0],
    traceLinks: [{ evidenceCode: "E-404", evidenceId: null, evidence: null }],
  });
  assert.equal(summary.direct[0].source, null);
  assert.equal(summary.direct[0].evidenceCode, "E-404");
});
