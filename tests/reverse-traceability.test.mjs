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


test("reverse decision trail accepts only exact structured tracker and requirement provenance", async () => {
  const { summarizeReverseDecisions } = await import("../src/lib/traceability/reverse.mjs");
  const entries = [
    { id: "d1", action: "linked_tracker_change_to_requirement", actor: "human", createdAt: new Date("2026-10-03T10:00:00.000Z"), detail: JSON.stringify({ syncMapId: "map-1", requirementId: "req-1", requirementRef: "REQ-01", mappingMethod: "human_review" }) },
    { id: "d2", action: "linked_tracker_change_to_requirement", actor: "human", detail: "Legacy free-form journal detail" },
    { id: "d3", action: "linked_tracker_change_to_requirement", actor: "human", detail: JSON.stringify({ syncMapId: "map-2", requirementId: "req-1", requirementRef: "REQ-01" }) },
    { id: "d4", action: "linked_tracker_change_to_requirement", actor: "human", detail: JSON.stringify({ syncMapId: "map-1", requirementId: "req-2", requirementRef: "REQ-02" }) },
  ];
  assert.deepEqual(summarizeReverseDecisions(entries, "req-1", "map-1"), [{
    id: "d1", action: "linked_tracker_change_to_requirement", actor: "human",
    createdAt: new Date("2026-10-03T10:00:00.000Z"), mappingMethod: "human_review", requirementRef: "REQ-01",
  }]);
});


test("Reverse Mode resolves a requirement reference only inside the active project and returns linked tracker mappings", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const route = fs.readFileSync(path.join(root, "src", "app", "api", "projects", "[id]", "traceability", "reverse", "route.ts"), "utf8");
  assert.ok(route.includes('const requirementRef = request.nextUrl.searchParams.get("requirementId")'));
  assert.ok(route.includes('where: { projectId, OR: [{ id: requirementRef }, { refId: requirementRef }] }'));
  assert.ok(route.includes("db.syncMap.findMany({"));
  assert.ok(route.includes("summarizeReverseDecisions(decisionEntries, requirement.id, mapping.id)"));
  assert.ok(route.includes('mode: "requirement_to_trackers"'));
});

test("Reverse Mode UI connects requirement-first inspection to the existing human-reviewed trace detail", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ui = fs.readFileSync(path.join(root, "src", "components", "rp", "debrief-instruments.tsx"), "utf8");
  assert.ok(ui.includes("REVERSE MODE — REQUIREMENT TO REAL-WORLD CHANGES"));
  assert.ok(ui.includes("inspectRequirement"));
  assert.ok(ui.includes("requirementId="));
  assert.ok(ui.includes('inspectReverseTrace(mapping)'));
  assert.ok(ui.includes("mapping.decisions"));
});
