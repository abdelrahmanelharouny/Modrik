#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { evaluateOrganizationMemoryBenchmark } from "../src/lib/knowledge-graph/organization-memory-retrieval.mjs";
import { fuseOrganizationMemoryRankings } from "../src/lib/knowledge-graph/organization-memory-semantic-search.mjs";

function option(name, fallback) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}
function uniqueIds(value, field, queryId) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim())) {
    throw new TypeError(`Query ${queryId}: ${field} must be an array of non-empty IDs.`);
  }
  return [...new Set(value)];
}
function validateQuery(query, index) {
  const id = typeof query?.id === "string" && query.id.trim() ? query.id.trim() : String(index + 1);
  if (typeof query?.projectId !== "string" || !query.projectId.trim()) throw new TypeError(`Query ${id}: projectId is required.`);
  const relevantIds = uniqueIds(query.relevantIds, "relevantIds", id);
  if (!relevantIds.length) throw new TypeError(`Query ${id}: at least one judged relevant ID is required.`);
  const bm25RankedIds = uniqueIds(query.bm25RankedIds, "bm25RankedIds", id);
  const semanticRankedIds = uniqueIds(query.semanticRankedIds ?? [], "semanticRankedIds", id);
  return { id, language: typeof query.language === "string" && query.language.trim() ? query.language.trim().toLowerCase() : "unspecified", projectId: query.projectId, relevantIds, bm25RankedIds, semanticRankedIds };
}
async function main() {
  const inputPath = option("input", "");
  if (!inputPath) throw new Error("Pass --input=<judged-retrieval-snapshot.json>.");
  const k = Number(option("k", "10"));
  if (!Number.isSafeInteger(k) || k < 1 || k > 100) throw new RangeError("--k must be an integer from 1 to 100.");
  const source = JSON.parse(await readFile(inputPath, "utf8"));
  if (!source || !Array.isArray(source.queries) || !source.queries.length) throw new TypeError("Input must contain a non-empty queries array.");
  const queries = source.queries.map(validateQuery);
  const bm25Judgments = [], hybridJudgments = [];
  for (const query of queries) {
    const lexical = query.bm25RankedIds.slice(0, k).map((id) => ({ id, projectId: query.projectId, status: "accepted" }));
    const semantic = query.semanticRankedIds.slice(0, k).map((id) => ({ id, projectId: query.projectId, status: "accepted" }));
    const hybrid = fuseOrganizationMemoryRankings({ rankings: [lexical, semantic], projectIds: [query.projectId], limit: k });
    bm25Judgments.push({ language: query.language, relevantIds: query.relevantIds, rankedIds: lexical.map((row) => row.id), k });
    hybridJudgments.push({ language: query.language, relevantIds: query.relevantIds, rankedIds: hybrid.map((row) => row.id), k });
  }
  const report = {
    benchmark: "organization-memory-judged-retrieval",
    dataset: { name: source.name ?? "unnamed", version: source.version ?? null, provenance: source.provenance ?? "unspecified", queryCount: queries.length, topK: k },
    metrics: { bm25: evaluateOrganizationMemoryBenchmark(bm25Judgments), hybridRrf: evaluateOrganizationMemoryBenchmark(hybridJudgments) },
    perQuery: queries.map((query, index) => ({
      id: query.id, language: query.language, relevantCount: query.relevantIds.length,
      bm25: bm25Judgments[index].rankedIds, hybridRrf: hybridJudgments[index].rankedIds,
    })),
    caveats: [
      "Metrics are only as valid as the supplied human-judged relevance labels and retrieval snapshots.",
      "This evaluator does not generate embeddings or run retrieval; capture BM25 and semantic rankings from the same authorized query snapshot.",
      "Do not treat synthetic fixtures or unreviewed LLM judgments as participant evidence.",
    ],
  };
  const outputPath = option("output", "");
  if (outputPath) await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ dataset: report.dataset, bm25: report.metrics.bm25.macro, hybridRrf: report.metrics.hybridRrf.macro, outputPath: outputPath || null }, null, 2));
}
main().catch((error) => { console.error("[organization-memory-judged-eval] failed", error instanceof Error ? error.message : "unknown error"); process.exitCode = 1; });
