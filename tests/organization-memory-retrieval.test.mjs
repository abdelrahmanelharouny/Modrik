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
  assert.equal(normalizeOrganizationMemoryText("ا\u0610\u06DD\u064B\u0640"), "ا", "extended Arabic marks and tatweel are ignored");
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


test("streaming BM25 ranks old matches outside 1,000 rows with bounded page memory", async () => {
  const { rankOrganizationMemoryCandidatesStream } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const rows = Array.from({ length: 1_251 }, (_, index) => ({
    id: `stream-${String(index).padStart(4, "0")}`,
    projectId: "p1",
    status: "accepted",
    kind: "decision",
    label: index === 1_250 ? "Needle archive" : "Ordinary project note",
    description: index === 1_250 ? "An old but relevant decision" : "General project context",
    updatedAt: new Date(Date.UTC(2026, 9, 31) - Math.floor(index / 3) * 1000),
    nodeRef: `ref-${index}`,
    confidence: 0.8,
    origin: "human",
    project: { name: "Project One" },
  }));
  const calls = [];
  let largestBatch = 0;
  const findMany = async (args) => {
    calls.push(args);
    const clauses = args.where.AND ?? [];
    const snapshotAt = clauses.find((clause) => clause.updatedAt?.lte)?.updatedAt.lte;
    const boundary = clauses.find((clause) => clause.OR)?.OR;
    const filtered = rows.filter((row) => {
      if (!args.where.projectId.in.includes(row.projectId) || row.status !== args.where.status) return false;
      if (snapshotAt && row.updatedAt > snapshotAt) return false;
      if (!boundary) return true;
      const [older, same] = boundary;
      return row.updatedAt < older.updatedAt.lt ||
        (row.updatedAt.getTime() === same.updatedAt.getTime() && row.id > same.id.gt);
    });
    const batch = filtered.slice(0, args.take);
    largestBatch = Math.max(largestBatch, batch.length);
    return batch;
  };
  const result = await rankOrganizationMemoryCandidatesStream({
    where: { projectId: { in: ["p1"] }, status: "accepted" },
    projectIds: ["p1"],
    query: "needle archive",
    limit: 3,
    batchSize: 71,
    snapshotAt: new Date(Date.UTC(2026, 10, 1)),
    withProject: true,
    findMany,
  });
  assert.equal(result.candidatesScanned, 1_251);
  assert.equal(result.rankingCandidatesScanned, 1_251);
  assert.equal(result.passes, 2);
  assert.equal(result.rows[0].id, "stream-1250");
  assert.equal(result.rows[0].project.name, "Project One");
  assert.equal(result.rows.length, 1);
  assert.equal(largestBatch, 71);
  assert.equal(result.pages, calls.length);
  assert.equal(calls.length, Math.ceil(1_251 / 71) * 2);
  assert.ok(calls.every((call) => call.take === 71 && call.where.status === "accepted" && call.where.projectId.in[0] === "p1"));
});

test("streaming BM25 requires an explicit accepted project scope", async () => {
  const { rankOrganizationMemoryCandidatesStream } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  await assert.rejects(() => rankOrganizationMemoryCandidatesStream({
    where: { status: "accepted" }, projectIds: ["p1"], query: "policy",
    findMany: async () => [],
  }), TypeError);
  await assert.rejects(() => rankOrganizationMemoryCandidatesStream({
    where: { projectId: { in: ["p2"] }, status: "accepted" }, projectIds: ["p1"], query: "policy",
    findMany: async () => [],
  }), TypeError);
});


test("streaming BM25 scores and tie-breaks match the in-memory BM25 reference", async () => {
  const {
    rankOrganizationMemoryCandidates,
    rankOrganizationMemoryCandidatesStream,
  } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const candidates = [
    { id: "a", projectId: "p1", status: "accepted", kind: "decision", label: "Arabic policy review", description: "policy governance" },
    { id: "b", projectId: "p1", status: "accepted", kind: "risk", label: "Policy risk", description: "governance review" },
    { id: "c", projectId: "p1", status: "accepted", kind: "decision", label: "Unrelated note", description: "general context" },
    { id: "d", projectId: "p1", status: "accepted", kind: "policy", label: "Policy review", description: "governance" },
  ].map((row, index) => ({ ...row, updatedAt: new Date(Date.UTC(2026, 9, 1) - index * 1000), nodeRef: row.id, project: { name: "P1" } }));
  const expected = rankOrganizationMemoryCandidates({ projectIds: ["p1"], candidates, query: "policy review", mode: "lexical", limit: 3 });
  const findMany = async (args) => {
    const boundary = args.where.AND?.find((clause) => clause.OR)?.OR;
    return candidates.filter((row) => {
      if (row.projectId !== "p1" || row.status !== "accepted") return false;
      if (!boundary) return true;
      const [older, same] = boundary;
      return row.updatedAt < older.updatedAt.lt ||
        (row.updatedAt.getTime() === same.updatedAt.getTime() && row.id > same.id.gt);
    }).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)).slice(0, args.take);
  };
  const actual = await rankOrganizationMemoryCandidatesStream({
    where: { projectId: { in: ["p1"] }, status: "accepted" },
    projectIds: ["p1"], query: "policy review", limit: 3, batchSize: 2,
    snapshotAt: new Date(Date.UTC(2026, 10, 1)), withProject: true, findMany,
  });
  assert.deepEqual(actual.rows.map((row) => row.id), expected.map((row) => row.id));
  assert.deepEqual(actual.rows.map((row) => row.retrieval.score), expected.map((row) => row.retrieval.score));
});


test("persistent indexed BM25 matches streaming BM25 scores and ranking with bounded posting pages", async () => {
  const { rankOrganizationMemoryCandidatesIndexed, rankOrganizationMemoryCandidatesStream } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const docs = [
    { id: "d1", nodeId: "n1", projectId: "p1", status: "accepted", normalizerVersion: 1, tokenCount: 6, updatedAt: new Date("2026-11-01T00:00:00Z") },
    { id: "d2", nodeId: "n2", projectId: "p1", status: "accepted", normalizerVersion: 1, tokenCount: 5, updatedAt: new Date("2026-11-01T00:00:00Z") },
    { id: "d3", nodeId: "n3", projectId: "p2", status: "accepted", normalizerVersion: 1, tokenCount: 3, updatedAt: new Date("2026-11-01T00:00:00Z") },
    { id: "d4", nodeId: "n4", projectId: "p1", status: "rejected", normalizerVersion: 1, tokenCount: 2, updatedAt: new Date("2026-11-01T00:00:00Z") },
  ];
  const raw = [
    ["d1","data",2],["d1","retention",1],["d1","policy",2],
    ["d2","data",1],["d2","retention",2],["d2","policy",1],
    ["d3","data",1],["d3","retention",1],
    ["d4","data",1],["d4","retention",1],
  ].map(([documentId,term,frequency]) => ({ documentId, term, frequency, projectId: documentId==="d3"?"p2":"p1", status: documentId==="d4"?"rejected":"accepted", normalizerVersion:1, document: docs.find(d=>d.id===documentId) }));
  const nodeRows = [
    { id:"n1", projectId:"p1", status:"accepted", kind:"policy", label:"data data retention", description:"policy policy", updatedAt:docs[0].updatedAt, project:{name:"P1"} },
    { id:"n2", projectId:"p1", status:"accepted", kind:"policy", label:"data retention retention", description:"policy", updatedAt:docs[1].updatedAt, project:{name:"P1"} },
  ];
  const aggregateDocuments = async ({where}) => {
    const selected=docs.filter(d=>where.projectId.in.includes(d.projectId)&&d.status===where.status&&d.normalizerVersion===where.normalizerVersion);
    return {_count:{_all:selected.length},_sum:{tokenCount:selected.reduce((s,d)=>s+d.tokenCount,0)}};
  };
  const findPostings = async ({where,take}) => raw.filter(p=>where.document.is.projectId.in.includes(p.document.projectId)&&p.document.status===where.document.is.status&&p.document.normalizerVersion===where.document.is.normalizerVersion&&p.document.updatedAt<=where.document.is.updatedAt.lte&&where.term.in.includes(p.term)&&(!where.AND||p.documentId>where.AND[0].OR[0].documentId.gt||(p.documentId===where.AND[0].OR[1].documentId&&p.term>where.AND[0].OR[1].term.gt))).sort((a,b)=>a.documentId.localeCompare(b.documentId)||a.term.localeCompare(b.term)).slice(0,take);
  const findCandidates = async ({where}) => nodeRows.filter(n=>where.id.in.includes(n.id)&&where.projectId.in.includes(n.projectId)&&n.status===where.status);
  const indexed=await rankOrganizationMemoryCandidatesIndexed({projectIds:["p1"],query:"data retention",limit:10,batchSize:2,aggregateDocuments,findPostings,findCandidates,snapshotAt:new Date("2026-11-02T00:00:00Z")});
  const stream=await rankOrganizationMemoryCandidatesStream({projectIds:["p1"],where:{projectId:{in:["p1"]},status:"accepted"},query:"data retention",limit:10,batchSize:3,snapshotAt:new Date("2026-11-02T00:00:00Z"),withProject:true,findMany:async ({where,take})=>nodeRows.filter(n=>where.projectId.in.includes(n.projectId)&&n.status===where.status).slice(0,take)});
  assert.deepEqual(indexed.rows.map(n=>n.id),stream.rows.map(n=>n.id));
  for(let i=0;i<indexed.rows.length;i++) assert.ok(Math.abs(indexed.rows[i].retrieval.score-stream.rows[i].retrieval.score)<1e-8);
  assert.equal(indexed.candidatesScanned,2);
  assert.equal(indexed.postingsScanned,6);
  assert.equal(indexed.rows[0].retrieval.mode,"indexed_bm25");
  assert.ok(indexed.pages>1);
});

test("indexed retrieval fails closed on invalid posting scope and malformed aggregate statistics", async () => {
  const { rankOrganizationMemoryCandidatesIndexed } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const base={projectIds:["p1"],query:"policy",aggregateDocuments:async()=>({_count:{_all:1},_sum:{tokenCount:2}}),findCandidates:async()=>[]};
  await assert.rejects(()=>rankOrganizationMemoryCandidatesIndexed({...base,findPostings:async()=>[{documentId:"d",term:"policy",frequency:1,document:{nodeId:"n",projectId:"p2",status:"accepted",normalizerVersion:1,tokenCount:2}}]}),TypeError);
  await assert.rejects(()=>rankOrganizationMemoryCandidatesIndexed({...base,aggregateDocuments:async()=>({_count:{_all:-1},_sum:{tokenCount:2}}),findPostings:async()=>[]}),TypeError);
});


test("indexed retrieval finds a rare archived match beyond 1,000 recent records", async () => {
  const { rankOrganizationMemoryCandidatesIndexed, rankOrganizationMemoryCandidatesStream } = await import("../src/lib/knowledge-graph/organization-memory-retrieval.mjs");
  const snapshotAt = new Date("2026-11-02T00:00:00Z");
  const rows = Array.from({length: 1207}, (_, index) => {
    const oldMatch = index === 1206;
    return {
      id: `n${String(index).padStart(4,"0")}`, projectId:"p1", status:"accepted",
      kind:"decision", label:oldMatch?"Rare archived":"Common project note",
      description:oldMatch?"old needle":"general notes",
      updatedAt:new Date(snapshotAt.getTime()-index*1000), project:{name:"P1"},
    };
  });
  const docs = rows.map((node,index)=>({
    id:`d${String(index).padStart(4,"0")}`,nodeId:node.id,projectId:"p1",status:"accepted",
    normalizerVersion:1,tokenCount:(node.label+" "+node.description+" "+node.kind).trim().split(/\s+/).length,
    updatedAt:node.updatedAt,
  }));
  const postings = [{documentId:"d1206",term:"needle",frequency:1,document:docs[1206]}];
  const indexed = await rankOrganizationMemoryCandidatesIndexed({
    projectIds:["p1"],query:"needle",limit:5,batchSize:25,snapshotAt,
    aggregateDocuments:async()=>({_count:{_all:docs.length},_sum:{tokenCount:docs.reduce((sum,d)=>sum+d.tokenCount,0)}}),
    findPostings:async({where,take})=>postings.filter(p=>where.term.in.includes(p.term)&&where.document.is.projectId.in.includes(p.document.projectId)&&p.document.status===where.document.is.status).slice(0,take),
    findCandidates:async({where})=>rows.filter(row=>where.id.in.includes(row.id)&&where.projectId.in.includes(row.projectId)&&row.status===where.status),
  });
  const stream = await rankOrganizationMemoryCandidatesStream({
    projectIds:["p1"],where:{projectId:{in:["p1"]},status:"accepted"},query:"needle",limit:5,batchSize:173,snapshotAt,withProject:true,
    findMany:async({where,take})=>{
      const boundary=where.AND?.find(clause=>clause.OR)?.OR;
      return rows.filter(row=>{
        if(row.projectId!=="p1"||row.status!=="accepted")return false;
        if(!boundary)return true;
        const [older,same]=boundary;
        return row.updatedAt<older.updatedAt.lt||(row.updatedAt.getTime()===same.updatedAt.getTime()&&row.id>same.id.gt);
      }).sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)).slice(0,take);
    },
  });
  assert.equal(indexed.rows[0].id,"n1206");
  assert.equal(stream.rows[0].id,"n1206");
  assert.equal(indexed.candidatesScanned,1);
  assert.equal(stream.candidatesScanned,1207);
  assert.ok(Math.abs(indexed.rows[0].retrieval.score-stream.rows[0].retrieval.score)<1e-8);
});
