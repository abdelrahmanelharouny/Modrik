import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOrganizationMemoryText, tokenizeOrganizationMemoryText,
  rankOrganizationMemoryCandidates,
} from "../src/lib/knowledge-graph/organization-memory-retrieval.mjs";

const corpus = [
  { id: "n1", projectId: "p1", status: "accepted", kind: "decision", label: "Data retention policy", description: "Keep audit records for seven years." },
  { id: "n2", projectId: "p1", status: "accepted", kind: "risk", label: "Database outage", description: "Restore service after regional failure." },
  { id: "n3", projectId: "p2", status: "accepted", kind: "decision", label: "Data retention", description: "Cross-tenant record retention." },
  { id: "n4", projectId: "p1", status: "proposed", kind: "decision", label: "Data retention draft", description: "Not approved." },
];

test("normalization supports Arabic diacritics, alef variants and code-switching", () => {
  assert.equal(normalizeOrganizationMemoryText(String.fromCodePoint(0x625, 0x650, 0x62f, 0x627, 0x631, 0x629, 0x64f, 0x20, 0x627, 0x644, 0x628, 0x64e, 0x64a, 0x627, 0x646, 0x627, 0x62a, 0x650)), String.fromCodePoint(0x627, 0x62f, 0x627, 0x631, 0x629, 0x20, 0x627, 0x644, 0x628, 0x64a, 0x627, 0x646, 0x627, 0x62a));
  assert.deepEqual(tokenizeOrganizationMemoryText("Policy سياسة 2026"), ["policy", "سياسة", "2026"]);
});

test("lexical ranking is relevance ordered and excludes unaccepted and cross-tenant nodes", () => {
  const results = rankOrganizationMemoryCandidates({ projectIds: ["p1"], candidates: corpus, query: "data retention", mode: "lexical" });
  assert.equal(results[0].id, "n1");
  assert.deepEqual(results.map((item) => item.id), ["n1"]);
  assert.equal(results.every((item) => item.status === "accepted" && item.projectId === "p1"), true);
});

test("repeating query terms does not inflate BM25 relevance scores", () => {
  const ordinary = rankOrganizationMemoryCandidates({ projectIds: ["p1"], candidates: corpus, query: "data retention", mode: "lexical" });
  const repeated = rankOrganizationMemoryCandidates({ projectIds: ["p1"], candidates: corpus, query: "data data data retention retention", mode: "lexical" });
  assert.deepEqual(repeated.map((item) => ({ id: item.id, score: item.retrieval.score })), ordinary.map((item) => ({ id: item.id, score: item.retrieval.score })));
});

test("semantic ranking is intersected with the authorized accepted candidate set", () => {
  const results = rankOrganizationMemoryCandidates({
    projectIds: ["p1"], candidates: corpus, query: "regional resilience", mode: "semantic",
    semanticScores: [{ id: "n2", score: 0.91 }, { id: "n3", score: 0.99 }, { id: "n4", score: 0.98 }, { id: "unknown", score: 1 }],
  });
  assert.deepEqual(results.map((item) => item.id), ["n2"]);
});

test("hybrid reciprocal-rank fusion combines independent rankings deterministically", () => {
  const results = rankOrganizationMemoryCandidates({
    projectIds: ["p1"], candidates: corpus, query: "data retention", mode: "hybrid",
    semanticScores: [{ id: "n2", score: 0.99 }],
  });
  assert.deepEqual(results.map((item) => item.id), ["n1", "n2"]);
  assert.equal(results[0].retrieval.mode, "hybrid");
});

test("ranking fails closed without authorized projects and bounds result size", () => {
  assert.deepEqual(rankOrganizationMemoryCandidates({ candidates: corpus, query: "data" }), []);
  const results = rankOrganizationMemoryCandidates({ projectIds: ["p1"], candidates: corpus, query: "data", limit: 9999 });
  assert.equal(results.length, 1);
});

test("invalid semantic scores and unsupported modes cannot inject results", () => {
  const results = rankOrganizationMemoryCandidates({
    projectIds: ["p1"], candidates: corpus, query: "database", mode: "semantic",
    semanticScores: [{ id: "n2", score: 5 }, { id: "n1", score: Number.NaN }],
  });
  assert.deepEqual(results, []);
});


test("retrieval evaluation reports precision, recall, reciprocal rank and NDCG", async () => {
  const { evaluateOrganizationMemoryRanking } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const metrics = evaluateOrganizationMemoryRanking({ rankedIds: ["n2", "n1", "n1", "n3", "n4"], relevantIds: ["n1", "n3", "missing"], k: 3 });
  assert.equal(metrics.k, 3);
  assert.equal(metrics.relevantCount, 3);
  assert.equal(metrics.retrievedCount, 3);
  assert.equal(metrics.hits, 2);
  assert.equal(metrics.precisionAtK, 2 / 3);
  assert.equal(metrics.recallAtK, 2 / 3);
  assert.equal(metrics.reciprocalRank, 0.5);
  assert.ok(metrics.ndcgAtK > 0 && metrics.ndcgAtK < 1);
});

test("retrieval evaluation handles empty relevance sets, invalid input and duplicate result IDs", async () => {
  const { evaluateOrganizationMemoryRanking } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  assert.deepEqual(evaluateOrganizationMemoryRanking({ rankedIds: ["a", "a"], relevantIds: [], k: 0 }), {
    k: 10, relevantCount: 0, retrievedCount: 1, hits: 0, precisionAtK: 0,
    recallAtK: 0, reciprocalRank: 0, ndcgAtK: 0,
  });
  assert.throws(() => evaluateOrganizationMemoryRanking(null), TypeError);
});


test("benchmark aggregation reports macro, micro and language-sliced retrieval metrics", async () => {
  const { evaluateOrganizationMemoryBenchmark } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const result = evaluateOrganizationMemoryBenchmark([
    { language: "Arabic", rankedIds: ["a1", "a2"], relevantIds: ["a1"], k: 2 },
    { language: "English", rankedIds: ["e2", "e1"], relevantIds: ["e1"], k: 2 },
    { language: "code-switched", rankedIds: ["c1"], relevantIds: ["c1"], k: 2 },
    { language: "Arabic", rankedIds: ["ignored"], relevantIds: [], k: 2 },
  ]);
  assert.equal(result.totalQueries, 4);
  assert.equal(result.evaluatedQueries, 3);
  assert.equal(result.excludedUnjudgedQueries, 1);
  assert.equal(result.macro.queryCount, 3);
  assert.equal(result.macro.mrr, (1 + 0.5 + 1) / 3);
  assert.equal(result.perLanguage.arabic.queryCount, 1);
  assert.equal(result.perLanguage.english.mrr, 0.5);
  assert.equal(result.perLanguage["code-switched"].recallAtK, 1);
  assert.equal(result.microPrecision, 3 / 5);
  assert.equal(result.microRecall, 1);
});

test("benchmark aggregation rejects malformed collections and query entries", async () => {
  const { evaluateOrganizationMemoryBenchmark } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  assert.throws(() => evaluateOrganizationMemoryBenchmark(null), TypeError);
  assert.throws(() => evaluateOrganizationMemoryBenchmark([null]), TypeError);
});


test("indexed keyset scanner covers candidates beyond the former 1,000-row window", async () => {
  const { scanOrganizationMemoryCandidates } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const rows = Array.from({ length: 1_237 }, (_, index) => ({ id: `node-${String(index).padStart(4, "0")}`, projectId: index % 3 === 0 ? "p2" : "p1", status: "accepted", updatedAt: new Date(Date.UTC(2026, 0, 1) - Math.floor(index / 4) * 1000) })).filter((row) => row.projectId === "p1").sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const calls = [];
  const findMany = async (args) => {
    calls.push(args);
    const boundary = args.where.AND?.at(-1)?.OR;
    return rows.filter((row) => {
      if (!args.where.projectId.in.includes(row.projectId) || row.status !== args.where.status) return false;
      if (!boundary) return true;
      const [older, same] = boundary;
      return row.updatedAt < older.updatedAt.lt || (row.updatedAt.getTime() === same.updatedAt.getTime() && row.id > same.id.gt);
    }).slice(0, args.take);
  };
  const result = await scanOrganizationMemoryCandidates({ where: { projectId: { in: ["p1"] }, status: "accepted" }, findMany, batchSize: 137 });
  assert.equal(result.candidatesScanned, rows.length);
  assert.deepEqual(result.rows.map((row) => row.id), rows.map((row) => row.id));
  assert.equal(result.pages, Math.ceil(rows.length / 137));
  assert.ok(calls.length > 1 && calls.every((call) => call.where.projectId.in.join(",") === "p1" && call.where.status === "accepted"));
});

test("indexed scanner rejects missing authorization filters and malformed adapter output", async () => {
  const { scanOrganizationMemoryCandidates } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  await assert.rejects(() => scanOrganizationMemoryCandidates({ findMany: async () => [] }), TypeError);
  await assert.rejects(() => scanOrganizationMemoryCandidates({ where: { projectId: { in: ["p1"] }, status: "accepted" }, findMany: async () => ({ rows: [] }) }), TypeError);
  await assert.rejects(() => scanOrganizationMemoryCandidates({ where: { projectId: { in: ["p1"] }, status: "accepted" }, findMany: async () => [{ id: "bad", updatedAt: "not-a-date" }] }), TypeError);
});
