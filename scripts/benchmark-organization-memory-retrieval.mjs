#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import {
  rankOrganizationMemoryCandidatesIndexed,
  rankOrganizationMemoryCandidatesStream,
  evaluateOrganizationMemoryBenchmark,
  compareOrganizationMemoryRetrievalParity,
  tokenizeOrganizationMemoryText,
} from "../src/lib/knowledge-graph/organization-memory-retrieval.mjs";
import { ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION } from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";

const TOPICS = [
  { key: "security", en: "security", ar: "أمن", query: "security", language: "en" },
  { key: "privacy", en: "privacy", ar: "خصوصية", query: "privacy", language: "en" },
  { key: "architecture", en: "architecture", ar: "معمارية", query: "architecture", language: "en" },
  { key: "requirements", en: "requirements", ar: "متطلبات", query: "متطلبات", language: "ar" },
  { key: "deployment", en: "deployment", ar: "نشر", query: "نشر", language: "ar" },
  { key: "analytics", en: "analytics", ar: "تحليلات", query: "تحليلات", language: "ar" },
  { key: "governance", en: "governance", ar: "حوكمة", query: "governance", language: "en" },
  { key: "testing", en: "testing", ar: "اختبارات", query: "اختبارات", language: "ar" },
];

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function buildCorpus(size) {
  const nodes = [];
  const documents = [];
  const postings = [];
  const projectIds = ["project-a", "project-b", "project-c", "project-d"];
  const snapshotAt = new Date("2026-11-06T00:00:00.000Z");
  for (let i = 0; i < size; i += 1) {
    const topic = TOPICS[i % TOPICS.length];
    const projectId = projectIds[i % projectIds.length];
    const accepted = i % 5 !== 0;
    const id = "node-" + String(i).padStart(8, "0");
    const updatedAt = new Date(snapshotAt.getTime() - i * 1000);
    const node = {
      id, projectId, status: accepted ? "accepted" : "proposed",
      kind: i % 3 === 0 ? "decision" : "requirement",
      label: topic.en + " " + topic.ar + " " + topic.key + " record " + i,
      description: "Evidence for " + topic.en + " " + topic.ar + "; " +
        (i % 11 === 0 ? "critical risk mitigation " : "operational context ") +
        "project memory reference " + (i % 97),
      updatedAt, project: { name: projectId },
    };
    nodes.push(node);
    if (!accepted) continue;
    const text = [node.label, node.description, node.kind].join(" ");
    const tokens = tokenizeOrganizationMemoryText(text);
    const frequencies = new Map();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    const document = {
      id: "doc-" + String(i).padStart(8, "0"),
      nodeId: id, projectId, status: "accepted",
      normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
      tokenCount: tokens.length, updatedAt,
    };
    documents.push(document);
    for (const [term, frequency] of frequencies) {
      postings.push({ documentId: document.id, term, frequency, document });
    }
  }
  postings.sort((a, b) => a.documentId.localeCompare(b.documentId) || a.term.localeCompare(b.term));
  const authorizedProjectIds = projectIds;
  const streamFindMany = async ({ where, take }) => {
    const cursorClause = (where.AND ?? []).find((clause) => Array.isArray(clause.OR));
    const snapshotClause = (where.AND ?? []).find((clause) => clause.updatedAt?.lte);
    return nodes.filter((node) => {
      if (!authorizedProjectIds.includes(node.projectId) || node.status !== "accepted") return false;
      if (snapshotClause && node.updatedAt > snapshotClause.updatedAt.lte) return false;
      if (cursorClause) {
        const [older, same] = cursorClause.OR;
        if (!(node.updatedAt < older.updatedAt.lt ||
          (node.updatedAt.getTime() === same.updatedAt.getTime() && node.id > same.id.gt))) return false;
      }
      return true;
    }).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, take);
  };
  const aggregateDocuments = async ({ where }) => {
    const selected = documents.filter((doc) =>
      where.projectId.in.includes(doc.projectId) && doc.status === where.status &&
      doc.normalizerVersion === where.normalizerVersion && doc.updatedAt <= where.updatedAt.lte);
    return {
      _count: { _all: selected.length },
      _sum: { tokenCount: selected.reduce((sum, doc) => sum + doc.tokenCount, 0) },
    };
  };
  const findPostings = async ({ where, take }) => {
    const cursorClause = where.AND?.[0]?.OR;
    return postings.filter((posting) => {
      const doc = posting.document;
      if (!where.term.in.includes(posting.term) ||
        !where.document.is.projectId.in.includes(doc.projectId) ||
        doc.status !== where.document.is.status ||
        doc.normalizerVersion !== where.document.is.normalizerVersion ||
        doc.updatedAt > where.document.is.updatedAt.lte) return false;
      if (cursorClause) {
        const [afterDocument, afterTerm] = cursorClause;
        if (!(posting.documentId > afterDocument.documentId.gt ||
          (posting.documentId === afterTerm.documentId && posting.term > afterTerm.term.gt))) return false;
      }
      return true;
    }).slice(0, take);
  };
  const findCandidates = async ({ where }) => nodes.filter((node) =>
    where.id.in.includes(node.id) && where.projectId.in.includes(node.projectId) && node.status === where.status);
  return { nodes, documents, postings, projectIds, snapshotAt, streamFindMany, aggregateDocuments, findPostings, findCandidates };
}

export async function runOrganizationMemoryRetrievalBenchmark(options = {}) {
  const size = Number(options.size ?? 10000);
  const repeats = Number(options.repeats ?? 3);
  const limit = Number(options.limit ?? 20);
  if (!Number.isSafeInteger(size) || size < 100 || size > 250000) throw new RangeError("size must be an integer from 100 to 250000");
  if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 10) throw new RangeError("repeats must be an integer from 1 to 10");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError("limit must be an integer from 1 to 100");
  const corpus = buildCorpus(size);
  const queries = TOPICS.map((topic) => ({
    ...topic,
    relevantIds: corpus.nodes.filter((node, index) =>
      node.status === "accepted" && index % TOPICS.length === TOPICS.findIndex((candidate) => candidate.key === topic.key)
    ).map((node) => node.id),
  }));
  const indexedLatency = [], streamingLatency = [];
  const indexedJudgments = [], streamingJudgments = [];
  const parityRows = [];
  let indexedPostingsScanned = 0, streamingCandidatesScanned = 0;
  let indexedCandidatesScanned = 0;

  for (const query of queries) {
    let indexed, streaming;
    for (let iteration = 0; iteration < repeats; iteration += 1) {
      const common = {
        projectIds: corpus.projectIds, query: query.query, limit, batchSize: 250,
        snapshotAt: corpus.snapshotAt,
      };
      let started = performance.now();
      indexed = await rankOrganizationMemoryCandidatesIndexed({
        ...common,
        normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
        aggregateDocuments: corpus.aggregateDocuments,
        findPostings: corpus.findPostings,
        findCandidates: corpus.findCandidates,
      });
      indexedLatency.push(performance.now() - started);
      started = performance.now();
      streaming = await rankOrganizationMemoryCandidatesStream({
        ...common,
        where: { projectId: { in: corpus.projectIds }, status: "accepted" },
        withProject: true,
        findMany: corpus.streamFindMany,
      });
      streamingLatency.push(performance.now() - started);
      indexedPostingsScanned += indexed.postingsScanned;
      indexedCandidatesScanned += indexed.candidatesScanned;
      streamingCandidatesScanned += streaming.candidatesScanned;
    }
    const relevant = query.relevantIds;
    indexedJudgments.push({
      language: query.language, k: limit, relevantIds: relevant,
      rankedIds: indexed.rows.map((row) => row.id),
    });
    streamingJudgments.push({
      language: query.language, k: limit, relevantIds: relevant,
      rankedIds: streaming.rows.map((row) => row.id),
    });
    parityRows.push(compareOrganizationMemoryRetrievalParity(streaming.rows, indexed.rows));
  }

  const indexedQuality = evaluateOrganizationMemoryBenchmark(indexedJudgments);
  const streamingQuality = evaluateOrganizationMemoryBenchmark(streamingJudgments);
  const average = (rows, key) => Number((rows.reduce((sum, row) => sum + row[key], 0) / (rows.length || 1)).toFixed(4));
  return {
    benchmark: "organization-memory-retrieval",
    environment: "synthetic-in-memory-adapters",
    warning: "These timings compare retrieval algorithms and adapter work in-process; they are not production database latency or a substitute for a PostgreSQL/SQLite load test.",
    corpus: {
      requestedNodes: size, acceptedDocuments: corpus.documents.length,
      projects: corpus.projectIds.length, queryCount: queries.length,
      judgedQueries: indexedQuality.evaluatedQueries, topK: limit,
    },
    quality: {
      indexed: indexedQuality,
      streaming: streamingQuality,
      parity: {
        exactRankMatchRate: Number((parityRows.filter((row) => row.exactRankMatch).length / (parityRows.length || 1)).toFixed(4)),
        meanTopKOverlap: average(parityRows, "topKRecall"),
        maxScoreDelta: Number(Math.max(0, ...parityRows.map((row) => row.maxAbsoluteScoreDelta)).toFixed(8)),
        queriesWithExactRankMatch: parityRows.filter((row) => row.exactRankMatch).length,
      },
    },
    performance: {
      repeatsPerQuery: repeats,
      indexedLatencyMs: { p50: percentile(indexedLatency, 50), p95: percentile(indexedLatency, 95), mean: average(indexedLatency.map(value => ({ value })), "value") },
      streamingLatencyMs: { p50: percentile(streamingLatency, 50), p95: percentile(streamingLatency, 95), mean: average(streamingLatency.map(value => ({ value })), "value") },
      indexedAverageCandidatesScanned: Number((indexedCandidatesScanned / (queries.length * repeats)).toFixed(2)),
      streamingAverageCandidatesScanned: Number((streamingCandidatesScanned / (queries.length * repeats)).toFixed(2)),
      indexedAveragePostingsScanned: Number((indexedPostingsScanned / (queries.length * repeats)).toFixed(2)),
      candidateScanReduction: Number((1 - indexedCandidatesScanned / Math.max(1, streamingCandidatesScanned)).toFixed(4)),
    },
    generatedAt: new Date().toISOString(),
  };
}

function parseOption(name, fallback) {
  const raw = process.argv.find((arg) => arg.startsWith("--" + name + "="));
  return raw ? raw.slice(name.length + 3) : fallback;
}

async function main() {
  const sizes = parseOption("sizes", "1000,10000").split(",").map(Number);
  const repeats = Number(parseOption("repeats", "3"));
  const reports = [];
  for (const size of sizes) reports.push(await runOrganizationMemoryRetrievalBenchmark({ size, repeats }));
  process.stdout.write(JSON.stringify({ reports }, null, 2) + "\n");
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write("[organization-memory-benchmark] " + (error?.stack ?? String(error)) + "\n");
    process.exitCode = 1;
  });
}
