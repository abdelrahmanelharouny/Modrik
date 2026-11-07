import test from "node:test";
import assert from "node:assert/strict";
import { repairOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-repair.mjs";

function fixture() {
  const nodes = [
    { id: "n1", projectId: "p1", status: "accepted", kind: "policy", label: "Canonical policy", description: "Keep source" },
    { id: "n2", projectId: "p1", status: "proposed", kind: "risk", label: "Canonical risk", description: "No source mutation" },
  ];
  const documents = new Map([
    ["d1", { id: "d1", nodeId: "n1", projectId: "p1" }],
    ["d2", { id: "d2", nodeId: "deleted", projectId: "p1" }],
  ]);
  const postings = new Map([["d1", [{ id: "x", documentId: "d1", term: "stale" }]], ["d2", [{ id: "y", documentId: "d2", term: "ghost" }]]]);
  const state = { reconciliationStatus: "completed" };
  const tx = {
    project: { findUnique: async () => ({ id: "p1", status: "active" }) },
    knowledgeNode: {
      findMany: async ({ where, take, select }) => {
        let rows = nodes.filter((node) => node.projectId === where.projectId);
        if (where.id?.gt) rows = rows.filter((node) => node.id > where.id.gt);
        if (where.id?.in) rows = rows.filter((node) => where.id.in.includes(node.id));
        rows.sort((a, b) => a.id.localeCompare(b.id));
        return rows.slice(0, take ?? rows.length).map((node) => Object.keys(select ?? {}).length === 1 ? { id: node.id } : node);
      },
    },
    organizationMemorySearchDocument: {
      upsert: async ({ where, create }) => {
        const old = [...documents.values()].find((doc) => doc.nodeId === where.nodeId);
        const id = old?.id ?? "d-" + where.nodeId;
        documents.set(id, { id, nodeId: where.nodeId, projectId: create.projectId });
        return { id };
      },
      findMany: async ({ where, take }) => [...documents.values()]
        .filter((doc) => doc.projectId === where.projectId && (!where.id?.gt || doc.id > where.id.gt))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, take ?? documents.size),
      deleteMany: async ({ where }) => {
        const doc = documents.get(where.id);
        if (!doc || doc.projectId !== where.projectId || doc.nodeId !== where.nodeId) return { count: 0 };
        documents.delete(where.id); return { count: 1 };
      },
    },
    organizationMemorySearchPosting: {
      deleteMany: async ({ where }) => { const rows = postings.get(where.documentId) ?? []; postings.delete(where.documentId); return { count: rows.length }; },
      createMany: async ({ data }) => { postings.set(data[0]?.documentId, data); return { count: data.length }; },
    },
    organizationMemorySearchIndexState: {
      updateMany: async ({ data }) => { Object.assign(state, data); return { count: 1 }; },
    },
  };
  return { tx, nodes, documents, postings, state };
}

test("repair rebuilds derived documents from canonical nodes in bounded resumable batches", async () => {
  const f = fixture();
  const a = await repairOrganizationMemorySearchIndexBatch(f.tx, { projectId: "p1", batchSize: 1 });
  assert.equal(a.phase, "nodes");
  assert.equal(a.processed, 1);
  assert.equal(a.nextCursor, "n1");
  const b = await repairOrganizationMemorySearchIndexBatch(f.tx, { projectId: "p1", phase: "nodes", cursor: a.nextCursor, batchSize: 1 });
  assert.equal(b.nextPhase, "nodes");
  const c = await repairOrganizationMemorySearchIndexBatch(f.tx, { projectId: "p1", phase: "nodes", cursor: b.nextCursor, batchSize: 1 });
  assert.equal(c.nextPhase, "documents");
  assert.ok([...f.documents.values()].some((doc) => doc.nodeId === "n2"));
  assert.equal(f.nodes[0].label, "Canonical policy");
  assert.equal(f.nodes[1].label, "Canonical risk");
});

test("repair refuses archived or missing projects before touching index rows", async () => {
  const f = fixture();
  f.tx.project.findUnique = async () => ({ id: "p1", status: "archived" });
  const result = await repairOrganizationMemorySearchIndexBatch(f.tx, { projectId: "p1" });
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, "project_archived");
  assert.equal(f.documents.has("d1"), true);
});

test("orphan cleanup is project-scoped, deletes postings first, and invalidates reconciliation", async () => {
  const f = fixture();
  const result = await repairOrganizationMemorySearchIndexBatch(f.tx, { projectId: "p1", phase: "documents", batchSize: 10 });
  assert.equal(result.status, "completed");
  assert.equal(result.removedOrphanDocuments, 1);
  assert.equal(f.documents.has("d2"), false);
  assert.equal(f.postings.has("d2"), false);
  assert.equal(result.removedOrphanPostings, 1);
  assert.equal(f.state.reconciliationStatus, "pending");
});
