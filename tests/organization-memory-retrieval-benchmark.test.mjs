import test from "node:test";
import assert from "node:assert/strict";
import { runOrganizationMemoryRetrievalBenchmark } from "../scripts/benchmark-organization-memory-retrieval.mjs";

test("synthetic retrieval benchmark compares indexed and streaming quality, parity and scan work", async () => {
  const result = await runOrganizationMemoryRetrievalBenchmark({ size: 800, repeats: 1, limit: 10 });
  assert.equal(result.environment, "synthetic-in-memory-adapters");
  assert.equal(result.corpus.requestedNodes, 800);
  assert.equal(result.corpus.queryCount, 8);
  assert.equal(result.quality.parity.queriesWithExactRankMatch, 8);
  assert.equal(result.quality.parity.meanTopKOverlap, 1);
  assert.ok(result.performance.indexedAverageCandidatesScanned < result.performance.streamingAverageCandidatesScanned);
  assert.ok(result.performance.candidateScanReduction > 0);
  assert.ok(result.performance.indexedLatencyMs.p95 >= 0);
  assert.ok(result.performance.streamingLatencyMs.p95 >= 0);
});

test("benchmark rejects unsafe corpus sizes and repeat counts", async () => {
  await assert.rejects(() => runOrganizationMemoryRetrievalBenchmark({ size: 99 }), RangeError);
  await assert.rejects(() => runOrganizationMemoryRetrievalBenchmark({ size: 100, repeats: 11 }), RangeError);
});
