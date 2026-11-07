import test from "node:test";
import assert from "node:assert/strict";
import {
  replaceOrganizationMemorySearchDocument,
  compareOrganizationMemorySearchDocument,
  ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
} from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";

function createFakeTransaction() {
  const state = { document: null, postings: [], operations: [] };
  return {
    state,
    organizationMemorySearchDocument: {
      upsert: async ({ where, create, update }) => {
        state.operations.push("document.upsert");
        if (state.document && state.document.nodeId !== where.nodeId) throw new Error("unique node mismatch");
        state.document = { id: "doc-1", ...create, ...(state.document ? update : {}) };
        return { id: state.document.id };
      },
    },
    organizationMemorySearchPosting: {
      deleteMany: async ({ where }) => {
        state.operations.push("postings.deleteMany");
        state.postings = state.postings.filter((item) => item.documentId !== where.documentId);
      },
      createMany: async ({ data }) => {
        state.operations.push("postings.createMany");
        state.postings.push(...data.map((item) => ({ id: `post-${state.postings.length}`, ...item })));
        return { count: data.length };
      },
    },
  };
}
const node = { id: "node-1", projectId: "project-1", status: "accepted", kind: "decision", label: "سياسة Data retention", description: "Keep records سياسة retention" };

test("search index write-through stores normalized document and distinct term frequencies", async () => {
  const tx = createFakeTransaction();
  const result = await replaceOrganizationMemorySearchDocument(tx, node);
  assert.equal(result.normalizerVersion, ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION);
  assert.equal(tx.state.document.nodeId, node.id);
  assert.equal(tx.state.document.projectId, node.projectId);
  assert.equal(tx.state.document.status, "accepted");
  assert.equal(tx.state.document.normalizedText.includes("سياسة"), true);
  assert.equal(tx.state.postings.find((posting) => posting.term === "retention").frequency, 2);
  assert.equal(tx.state.postings.length, result.uniqueTerms);
  assert.deepEqual(tx.state.operations, ["document.upsert", "postings.deleteMany", "postings.createMany"]);
});

test("reindex is idempotent and replaces stale postings after content changes", async () => {
  const tx = createFakeTransaction();
  await replaceOrganizationMemorySearchDocument(tx, node);
  const firstHash = tx.state.document.contentHash;
  await replaceOrganizationMemorySearchDocument(tx, node);
  assert.equal(tx.state.postings.filter((posting) => posting.term === "retention").length, 1);
  assert.equal(tx.state.document.contentHash, firstHash);
  await replaceOrganizationMemorySearchDocument(tx, { ...node, label: "سياسة access control", description: "access control only", status: "rejected" });
  assert.equal(tx.state.document.status, "rejected");
  assert.equal(tx.state.postings.some((posting) => posting.term === "retention"), false);
  assert.equal(tx.state.postings.some((posting) => posting.term === "access"), true);
  assert.notEqual(tx.state.document.contentHash, firstHash);
});

test("reconciliation detects missing, stale and matching index documents", async () => {
  const tx = createFakeTransaction();
  assert.deepEqual(compareOrganizationMemorySearchDocument(node, null), { matches: false, reason: "missing" });
  await replaceOrganizationMemorySearchDocument(tx, node);
  assert.equal(compareOrganizationMemorySearchDocument(node, { ...tx.state.document, nodeId: node.id }).matches, true);
  assert.deepEqual(compareOrganizationMemorySearchDocument({ ...node, description: "changed" }, tx.state.document), { matches: false, reason: "stale_or_mismatched" });
});

test("index maintenance rejects non-transaction clients and incomplete source nodes", async () => {
  await assert.rejects(() => replaceOrganizationMemorySearchDocument({}, node), TypeError);
  await assert.rejects(() => replaceOrganizationMemorySearchDocument(createFakeTransaction(), { id: "x" }), TypeError);
});
