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
