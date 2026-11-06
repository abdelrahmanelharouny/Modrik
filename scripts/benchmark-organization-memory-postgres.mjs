#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import {
  rankOrganizationMemoryCandidatesIndexed,
  rankOrganizationMemoryCandidatesStream,
  compareOrganizationMemoryRetrievalParity,
  evaluateOrganizationMemoryBenchmark,
} from "../src/lib/knowledge-graph/organization-memory-retrieval.mjs";
import {
  replaceOrganizationMemorySearchDocument,
  ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
} from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";

const db = new PrismaClient();
const TOPICS = [
  { key: "security", query: "security", language: "en" },
  { key: "privacy", query: "privacy", language: "en" },
  { key: "architecture", query: "architecture", language: "en" },
  { key: "requirements", query: "متطلبات", language: "ar" },
  { key: "deployment", query: "نشر", language: "ar" },
  { key: "analytics", query: "تحليلات", language: "ar" },
  { key: "governance", query: "governance", language: "en" },
  { key: "testing", query: "اختبارات", language: "ar" },
];
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Number((sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] ?? 0).toFixed(3));
};
const avg = (values) => Number((values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)).toFixed(3));
function option(name, fallback) {
  const value = process.argv.find((arg) => arg.startsWith("--" + name + "="));
  return value ? value.slice(name.length + 3) : fallback;
}
function assertSize(size) {
  if (!Number.isSafeInteger(size) || size < 100 || size > 100000) {
    throw new RangeError("Each PostgreSQL corpus size must be an integer from 100 to 100000.");
  }
}
async function seedCorpus(size, suffix) {
  const project = await db.project.create({
    data: { name: "Organization memory PostgreSQL benchmark " + suffix, brief: "Disposable benchmark fixture; no production data." },
  });
  const now = new Date();
  let rareIndex = Math.floor(size / 2);
  while (rareIndex < size - 1 && rareIndex % 7 === 0) rareIndex += 1;
  const rows = Array.from({ length: size }, (_, index) => {
    const topic = TOPICS[index % TOPICS.length];
    const accepted = index % 7 !== 0;
    return {
      id: randomUUID(), projectId: project.id, nodeRef: "BENCH-" + suffix + "-" + index,
      kind: index % 3 === 0 ? "decision" : "requirement",
      label: topic.key + " " + topic.query + " benchmark record " + index,
      description: "Evidence for " + topic.key + " " + topic.query + "; " +
        (index % 13 === 0 ? "critical risk mitigation " : "operational context ") +
        "reference cohort " + (index % 97) + (index === rareIndex ? " rarebenchmarksentinel" : ""),
      status: accepted ? "accepted" : "proposed", origin: "derived", confidence: 0.8,
      attributes: "{}", createdAt: now, updatedAt: new Date(now.getTime() - index),
    };
  });
  for (let offset = 0; offset < rows.length; offset += 1000) {
    await db.knowledgeNode.createMany({ data: rows.slice(offset, offset + 1000) });
  }
  const accepted = rows.filter((row) => row.status === "accepted");
  for (let offset = 0; offset < accepted.length; offset += 100) {
    const ids = accepted.slice(offset, offset + 100).map((row) => row.id);
    const nodes = await db.knowledgeNode.findMany({ where: { id: { in: ids }, projectId: project.id } });
    await db.$transaction(async (tx) => {
      for (const node of nodes) await replaceOrganizationMemorySearchDocument(tx, node);
    }, { timeout: 120000, maxWait: 10000 });
  }
  return { project, rows, acceptedCount: accepted.length, rareIndex };
}
async function runSize(size, repeats) {
  assertSize(size);
  const suffix = randomUUID().slice(0, 8);
  const { project, rows, acceptedCount, rareIndex } = await seedCorpus(size, suffix);
  const projectIds = [project.id];
  const queries = TOPICS.map((topic, topicIndex) => ({
    ...topic,
    relevantIds: rows.filter((row, index) =>
      row.status === "accepted" && index % TOPICS.length === topicIndex
    ).map((row) => row.id),
  }));
  queries.push({
    key: "rare-term", query: "rarebenchmarksentinel", language: "en",
    relevantIds: [rows[rareIndex].id],
  });
  const indexedTimes = [], streamingTimes = [], firstRunTimes = [];
  const indexedJudgments = [], streamingJudgments = [], parity = [];
  let indexedCandidates = 0, indexedPostings = 0, streamingCandidates = 0;
  try {
    for (const query of queries) {
      let indexedResult, streamingResult;
      for (let iteration = 0; iteration < repeats + 1; iteration += 1) {
        const common = { projectIds, query: query.query, limit: 20, batchSize: 250, snapshotAt: new Date(Date.now() + 1000) };
        let start = performance.now();
        indexedResult = await rankOrganizationMemoryCandidatesIndexed({
          ...common, normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
          aggregateDocuments: (args) => db.organizationMemorySearchDocument.aggregate(args),
          findPostings: (args) => db.organizationMemorySearchPosting.findMany(args),
          findCandidates: (args) => db.knowledgeNode.findMany(args),
        });
        const indexedMs = performance.now() - start;
        start = performance.now();
        streamingResult = await rankOrganizationMemoryCandidatesStream({
          ...common, where: { projectId: { in: projectIds }, status: "accepted" },
          withProject: true, findMany: (args) => db.knowledgeNode.findMany(args),
        });
        const streamingMs = performance.now() - start;
        if (iteration === 0) firstRunTimes.push(indexedMs, streamingMs);
        else { indexedTimes.push(indexedMs); streamingTimes.push(streamingMs); }
        indexedCandidates += indexedResult.candidatesScanned;
        indexedPostings += indexedResult.postingsScanned;
        streamingCandidates += streamingResult.candidatesScanned;
      }
      indexedJudgments.push({ language: query.language, k: 20, relevantIds: query.relevantIds, rankedIds: indexedResult.rows.map((row) => row.id) });
      streamingJudgments.push({ language: query.language, k: 20, relevantIds: query.relevantIds, rankedIds: streamingResult.rows.map((row) => row.id) });
      parity.push(compareOrganizationMemoryRetrievalParity(streamingResult.rows, indexedResult.rows));
      if (indexedResult.rows.some((row) => row.projectId !== project.id) || streamingResult.rows.some((row) => row.projectId !== project.id)) {
        throw new Error("Project isolation violation detected by PostgreSQL benchmark.");
      }
    }
    const indexedQuality = evaluateOrganizationMemoryBenchmark(indexedJudgments);
    const streamingQuality = evaluateOrganizationMemoryBenchmark(streamingJudgments);
    return {
      corpus: { requestedNodes: size, acceptedDocuments: acceptedCount, projectsInScope: 1, queries: queries.length, topK: 20 },
      quality: {
        indexed: indexedQuality, streaming: streamingQuality,
        parity: {
          exactRankMatchRate: Number((parity.filter((row) => row.exactRankMatch).length / parity.length).toFixed(4)),
          meanTopKOverlap: avg(parity.map((row) => row.topKRecall)),
          maxScoreDelta: Number(Math.max(0, ...parity.map((row) => row.maxAbsoluteScoreDelta)).toFixed(8)),
        },
      },
      performance: {
        measuredRepeatsPerQuery: repeats,
        firstRunLatencyMs: { indexedAndStreamingInterleaved: firstRunTimes.map((value) => Number(value.toFixed(3))) },
        indexedLatencyMs: { p50: percentile(indexedTimes, 50), p95: percentile(indexedTimes, 95), mean: avg(indexedTimes) },
        streamingLatencyMs: { p50: percentile(streamingTimes, 50), p95: percentile(streamingTimes, 95), mean: avg(streamingTimes) },
        indexedAverageCandidateDocumentsScanned: Number((indexedCandidates / (queries.length * (repeats + 1))).toFixed(2)),
        indexedAveragePostingsScannedAcrossBothPasses: Number((indexedPostings / (queries.length * (repeats + 1))).toFixed(2)),
        streamingAverageCandidatesScannedPerPass: Number((streamingCandidates / (queries.length * (repeats + 1))).toFixed(2)),
        candidateDocumentScanReduction: Number((1 - indexedCandidates / Math.max(1, streamingCandidates)).toFixed(4)),
      },
    };
  } finally {
    await db.project.delete({ where: { id: project.id } });
  }
}
async function main() {
  if (!process.env.DATABASE_URL?.startsWith("postgres")) throw new Error("Refusing to run: DATABASE_URL must point to PostgreSQL.");
  const sizes = option("sizes", "1000").split(",").map(Number);
  const repeats = Number(option("repeats", "2"));
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10) throw new RangeError("--repeats must be from 1 to 10.");
  const reports = [];
  for (const size of sizes) reports.push(await runSize(size, repeats));
  const report = {
    benchmark: "organization-memory-postgresql-retrieval",
    environment: "real-postgresql-prisma-adapters",
    disclaimer: "Database timings are environment-specific; first-run measurements are not guaranteed cold-cache measurements. Synthetic benchmark fixtures only; no production data or rollout flags are touched.",
    database: { provider: "postgresql", serverVersion: await db.$queryRawUnsafe("SHOW server_version") },
    normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    generatedAt: new Date().toISOString(), reports,
  };
  const json = JSON.stringify(report, null, 2) + "\n";
  const output = option("output", "");
  if (output) await writeFile(output, json, "utf8");
  process.stdout.write(json);
}
main().catch((error) => {
  process.stderr.write("[organization-memory-postgres-benchmark] " + (error?.stack ?? String(error)) + "\n");
  process.exitCode = 1;
}).finally(async () => { await db.$disconnect(); });
