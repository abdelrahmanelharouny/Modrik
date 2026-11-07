import test from "node:test";
import assert from "node:assert/strict";
import { buildOrganizationMemoryEmbeddingContent } from "../src/lib/knowledge-graph/organization-memory-embeddings.mjs";
import { searchTenantScopedOrganizationMemoryEmbeddings, fuseOrganizationMemoryRankings } from "../src/lib/knowledge-graph/organization-memory-semantic-search.mjs";

const nodes = [
  { id: "n1", projectId: "p1", status: "accepted", kind: "decision", label: "Data retention", description: "Keep records", project: { name: "Project 1", organizationId: "org-a" } },
  { id: "n2", projectId: "p1", status: "accepted", kind: "risk", label: "Service outage", description: "Recovery", project: { name: "Project 1", organizationId: "org-a" } },
  { id: "n3", projectId: "p2", status: "accepted", kind: "decision", label: "Data retention", description: "Other tenant", project: { name: "Project 2", organizationId: "org-b" } },
];
const record = (node, vector, id) => ({ id, organizationId: node.project.organizationId, projectId: node.projectId, nodeId: node.id, model: "embed-v1", dimensions: 3, vector: JSON.stringify(vector), norm: Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)), contentHash: buildOrganizationMemoryEmbeddingContent(node).contentHash, normalizerVersion: 1, status: "ready" });
const records = [record(nodes[0], [1, 0, 0], "e1"), record(nodes[1], [0, 1, 0], "e2"), record(nodes[2], [1, 0, 0], "e3")];

test("semantic retrieval pushes tenant filters into the first DB page", async () => {
  let embeddingQuery, nodeQuery;
  const result = await searchTenantScopedOrganizationMemoryEmbeddings({
    organizationId: "org-a", projectIds: ["p1"], model: "embed-v1", dimensions: 3,
    queryEmbedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] }, limit: 5, batchSize: 1,
    findEmbeddings: async (args) => {
      embeddingQuery = args;
      return records.filter((row) => row.organizationId === args.where.organizationId && args.where.projectId.in.includes(row.projectId) && row.model === args.where.model && row.dimensions === args.where.dimensions && row.status === args.where.status && (!args.where.id || row.id > args.where.id.gt)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, args.take);
    },
    findNodes: async (args) => {
      nodeQuery = args;
      return nodes.filter((node) => args.where.id.in.includes(node.id) && args.where.projectId.in.includes(node.projectId) && node.status === "accepted" && node.project.organizationId === args.where.project.organizationId);
    },
  });
  assert.equal(embeddingQuery.where.organizationId, "org-a");
  assert.deepEqual(embeddingQuery.where.projectId, { in: ["p1"] });
  assert.equal(embeddingQuery.where.model, "embed-v1");
  assert.equal(embeddingQuery.where.dimensions, 3);
  assert.equal(embeddingQuery.where.status, "ready");
  assert.equal(nodeQuery.where.project.organizationId, "org-a");
  assert.deepEqual(result.rows.map((row) => row.id), ["n1"]);
  assert.equal(result.candidatesScanned, 2);
});

test("semantic retrieval does not query with empty project scope", async () => {
  const result = await searchTenantScopedOrganizationMemoryEmbeddings({ organizationId: "org-a", projectIds: [], model: "embed-v1", dimensions: 3, queryEmbedding: { model: "embed-v1", dimensions: 3, vector: [1, 0, 0] }, findEmbeddings: async () => { throw new Error("must not query"); }, findNodes: async () => { throw new Error("must not query"); } });
  assert.deepEqual(result.rows, []); assert.equal(result.pages, 0);
});

test("hybrid fusion enforces accepted authorized projects", () => {
  const lexical = [{ id: "n1", projectId: "p1", status: "accepted" }, { id: "n2", projectId: "p1", status: "accepted" }];
  const semantic = [{ id: "n2", projectId: "p1", status: "accepted" }, { id: "n3", projectId: "p2", status: "accepted" }, { id: "n4", projectId: "p1", status: "proposed" }];
  const fused = fuseOrganizationMemoryRankings({ rankings: [lexical, semantic], projectIds: ["p1"], limit: 10 });
  assert.deepEqual(fused.map((row) => row.id), ["n2", "n1"]);
  assert.ok(fused.every((row) => row.retrieval.mode === "hybrid_rrf"));
});