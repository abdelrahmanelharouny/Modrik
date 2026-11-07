import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOrganizationMemoryBenchmark } from "../src/lib/knowledge-graph/organization-memory-retrieval.mjs";
import { fuseOrganizationMemoryRankings } from "../src/lib/knowledge-graph/organization-memory-semantic-search.mjs";

test("judged retrieval metrics compare BM25 with tenant-scoped reciprocal-rank fusion", () => {
  const relevant = ["a", "c"];
  const bm25 = ["x", "a", "y"];
  const semantic = ["c", "a", "z"];
  const fused = fuseOrganizationMemoryRankings({
    rankings: [
      bm25.map((id) => ({ id, projectId: "p1", status: "accepted" })),
      semantic.map((id) => ({ id, projectId: "p1", status: "accepted" })),
    ],
    projectIds: ["p1"], limit: 3,
  }).map((row) => row.id);
  const before = evaluateOrganizationMemoryBenchmark([{ language: "ar", relevantIds: relevant, rankedIds: bm25, k: 3 }]);
  const after = evaluateOrganizationMemoryBenchmark([{ language: "ar", relevantIds: relevant, rankedIds: fused, k: 3 }]);
  assert.equal(before.evaluatedQueries, 1);
  assert.equal(after.evaluatedQueries, 1);
  assert.ok(after.macro.recallAtK >= before.macro.recallAtK);
  assert.equal(after.perLanguage.ar.queryCount, 1);
});

test("hybrid evaluation input cannot retain unauthorized projects or proposed nodes", () => {
  const fused = fuseOrganizationMemoryRankings({ rankings: [[
    { id: "allowed", projectId: "p1", status: "accepted" },
    { id: "foreign", projectId: "p2", status: "accepted" },
    { id: "proposed", projectId: "p1", status: "proposed" },
  ]], projectIds: ["p1"], limit: 10 });
  assert.deepEqual(fused.map((row) => row.id), ["allowed"]);
});
