import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOrganizationKnowledgeQuery,
  buildOrganizationKnowledgeCandidateQuery,
  buildOrganizationReviewQueueQuery,
  summarizeOrganizationReviewQueueNode,
  summarizeOrganizationKnowledgeNode,
  hasVerifiedOrganizationMemoryIdentity,
  buildOrganizationMemoryPage,
  buildOrganizationMemoryCursorWhere,
  createOrganizationMemoryCursor,
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
    projectIds: ["p1"], kind: "untrusted-kind", limit: 9999, search: "x".repeat(200),
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
    id: "n1", projectId: "p1", project: { name: "Payments" }, nodeRef: "KN-01",
    kind: "decision", label: "Retention", description: "x".repeat(1500),
    confidence: 4, status: "accepted", updatedAt: "2026-11-04T00:00:00Z",
  });
  assert.equal(summary.description.length, 1200);
  assert.equal(summary.confidence, 1);
  assert.equal(summary.projectId, "p1");
  assert.equal(summary.projectName, "Payments");
  assert.equal(summarizeOrganizationKnowledgeNode({ id: "n2", status: "proposed" }), null);
});

test("organization memory summaries reject records without stable source identity", () => {
  assert.equal(summarizeOrganizationKnowledgeNode({
    id: "n1", status: "accepted", nodeRef: "KN-01", kind: "decision", label: "x",
  }), null);
});

test("organization review queue is limited to in-review nodes in authorized projects", () => {
  const result = buildOrganizationReviewQueueQuery({
    projectIds: ["p1", "p2", "p1", ""], kind: "risk", search: "  outage  ", limit: 12,
  });
  assert.deepEqual(result.where.projectId, { in: ["p1", "p2"] });
  assert.equal(result.where.status, "in_review");
  assert.equal(result.where.kind, "risk");
  assert.deepEqual(result.where.OR, [
    { label: { contains: "outage" } },
    { description: { contains: "outage" } },
  ]);
  assert.equal(result.take, 12);
  assert.equal(buildOrganizationReviewQueueQuery({ projectIds: [] }).take, 0);
});

test("review queue summaries expose only bounded in-review metadata with provenance", () => {
  const summary = summarizeOrganizationReviewQueueNode({
    id: "n1", projectId: "p1", project: { name: "Payments" }, nodeRef: "KN-01",
    kind: "risk", label: "Outage", description: "x".repeat(1300), confidence: -1,
    owner: "Team A", origin: "agent", status: "in_review",
  });
  assert.equal(summary.description.length, 1200);
  assert.equal(summary.confidence, 0);
  assert.equal(summary.projectName, "Payments");
  assert.equal(summary.owner, "Team A");
  assert.equal(summarizeOrganizationReviewQueueNode({ id: "n2", status: "accepted" }), null);
});

test("organization memory identity rejects missing tenant or actor scope before database queries", () => {
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ userId: "u1", role: "owner" }), false);
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ organizationId: "org1", role: "owner" }), false);
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ organizationId: "  ", userId: "u1", role: "owner" }), false);
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ organizationId: "org1", userId: " ", role: "owner" }), false);
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ organizationId: "org1", userId: "u1", role: "" }), false);
  assert.equal(hasVerifiedOrganizationMemoryIdentity({ organizationId: "org1", userId: "u1", role: "owner" }), true);
  assert.equal(hasVerifiedOrganizationMemoryIdentity(null), false);
});

test("BM25 candidate window is bounded, accepted-only, and tenant-scoped", () => {
  const result = buildOrganizationKnowledgeCandidateQuery({ projectIds: ["p1", "p2", "p1"], kind: "decision" });
  assert.deepEqual(result.where.projectId, { in: ["p1", "p2"] });
  assert.equal(result.where.status, "accepted");
  assert.equal(result.where.kind, "decision");
  assert.equal(result.take, null, "streaming BM25 owns candidate pagination and has no total-row cap");
  assert.deepEqual(result.orderBy, [{ updatedAt: "desc" }, { id: "asc" }]);
  const empty = buildOrganizationKnowledgeCandidateQuery({ projectIds: [] });
  assert.equal(empty.take, 0);
  assert.deepEqual(empty.where, { id: "__no_authorized_projects__" });
});


test("organization memory pagination uses opaque timestamp snapshots and bounded lookahead", () => {
  const anchor = { id: "node-25", updatedAt: new Date("2026-11-05T10:00:00.000Z") };
  const token = createOrganizationMemoryCursor(anchor);
  const page = buildOrganizationMemoryPage({ limit: 1000, cursor: token });
  assert.equal(page.limit, 100);
  assert.equal(page.take, 101);
  assert.equal(page.cursor.id, anchor.id);
  assert.equal(page.cursor.updatedAt.toISOString(), anchor.updatedAt.toISOString());
  assert.deepEqual(buildOrganizationMemoryPage({ limit: 25 }), { limit: 25, take: 26 });
  assert.deepEqual(buildOrganizationMemoryPage({ limit: 0 }), { limit: 25, take: 26 });
  assert.throws(() => buildOrganizationMemoryPage({ cursor: "invalid" }), TypeError);
  assert.throws(() => buildOrganizationMemoryPage({ cursor: "x".repeat(513) }), TypeError);
  assert.throws(() => buildOrganizationMemoryPage(null), TypeError);
});

test("organization memory keyset boundary preserves filters and handles equal timestamps", () => {
  const timestamp = new Date("2026-11-05T10:00:00.000Z");
  const where = { projectId: { in: ["p1"] }, status: "accepted", OR: [{ label: { contains: "x" } }] };
  const page = { cursor: { id: "node-25", updatedAt: timestamp } };
  const descending = buildOrganizationMemoryCursorWhere(where, page, "desc");
  assert.deepEqual(descending.projectId, where.projectId);
  assert.deepEqual(descending.OR, where.OR);
  assert.deepEqual(descending.AND[0].OR, [
    { updatedAt: { lt: timestamp } },
    { updatedAt: timestamp, id: { gt: "node-25" } },
  ]);
  const ascending = buildOrganizationMemoryCursorWhere(where, page, "asc");
  assert.deepEqual(ascending.AND[0].OR[0], { updatedAt: { gt: timestamp } });
  assert.throws(() => buildOrganizationMemoryCursorWhere(where, page, "invalid"), TypeError);
});
