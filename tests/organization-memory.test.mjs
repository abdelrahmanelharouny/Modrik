import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizationKnowledgeQuery,
  summarizeOrganizationKnowledgeNode,
} from "../src/lib/knowledge-graph/organization-memory.mjs";

test("organization memory query fails closed when no authorized projects are supplied", () => {
  const result = buildOrganizationKnowledgeQuery({ projectIds: [] });
  assert.equal(result.take, 0);
  assert.deepEqual(result.where, { id: "__no_authorized_projects__" });
});

test("organization memory query scopes strictly to supplied projects and accepted nodes", () => {
  const result = buildOrganizationKnowledgeQuery({
    projectIds: ["p1", "p2", "p1", "", null],
    kind: "decision",
    search: "  retention policy  ",
    limit: 20,
  });
  assert.deepEqual(result.where.projectId, { in: ["p1", "p2"] });
  assert.equal(result.where.status, "accepted");
  assert.equal(result.where.kind, "decision");
  assert.deepEqual(result.where.OR, [
    { label: { contains: "retention policy" } },
    { description: { contains: "retention policy" } },
  ]);
  assert.equal(result.take, 20);
});

test("organization memory query clamps limits and ignores unknown kinds", () => {
  const result = buildOrganizationKnowledgeQuery({
    projectIds: ["p1"],
    kind: "untrusted-kind",
    limit: 9999,
    search: "x".repeat(200),
  });
  assert.equal(result.take, 100);
  assert.equal("kind" in result.where, false);
  assert.equal(result.where.OR[0].label.contains.length, 120);
});

test("organization memory query rejects malformed top-level input", () => {
  assert.throws(() => buildOrganizationKnowledgeQuery(null), TypeError);
  assert.throws(() => buildOrganizationKnowledgeQuery([]), TypeError);
});

test("organization memory summaries expose accepted, bounded, source-attributed knowledge only", () => {
  const summary = summarizeOrganizationKnowledgeNode({
    id: "n1", projectId: "p1", nodeRef: "KN-01", kind: "decision",
    label: "Retention", description: "x".repeat(1500),
    confidence: 4, status: "accepted", updatedAt: "2026-11-04T00:00:00Z",
  });
  assert.equal(summary.description.length, 1200);
  assert.equal(summary.confidence, 1);
  assert.equal(summary.projectId, "p1");
  assert.equal(summarizeOrganizationKnowledgeNode({ id: "n2", status: "proposed" }), null);
});
