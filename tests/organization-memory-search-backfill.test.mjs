import test from "node:test";
import assert from "node:assert/strict";
import { backfillOrganizationMemorySearchIndexBatch, getOrganizationMemorySearchIndexReadiness } from "../src/lib/knowledge-graph/organization-memory-search-backfill.mjs";
import { ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION } from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";

function fakeTx(nodes) {
  const state = { row: null, docs: new Map(), postings: new Map() };
  return {
    state,
    organizationMemorySearchIndexState: {
      upsert: async ({ create }) => state.row ??= { id: "state-1", cursorNodeId: null, scannedCount: 0, indexedCount: 0, normalizerVersion: create.normalizerVersion, status: "pending", startedAt: null, completedAt: null },
      updateMany: async ({ where, data }) => {
        if (!state.row || state.row.cursorNodeId !== where.cursorNodeId || state.row.normalizerVersion !== where.normalizerVersion || state.row.status === "completed") return { count: 0 };
        Object.assign(state.row, data); return { count: 1 };
      },
    },
    knowledgeNode: { findMany: async ({ where, take }) => nodes.filter((n) => n.projectId === where.projectId && (!where.id || n.id > where.id.gt)).sort((a,b) => a.id.localeCompare(b.id)).slice(0,take) },
    organizationMemorySearchDocument: {
      upsert: async ({ where, create, update }) => { const old=state.docs.get(where.nodeId); const next={id:old?.id??`doc-${where.nodeId}`,...create,...(old?update:{})}; state.docs.set(where.nodeId,next); return {id:next.id}; },
    },
    organizationMemorySearchPosting: {
      deleteMany: async ({ where }) => state.postings.set(where.documentId, []),
      createMany: async ({ data }) => { const id=data[0]?.documentId; if(id) state.postings.set(id,data); return {count:data.length}; },
    },
  };
}
const nodes=["a","b","c","d","e"].map(id=>({id,projectId:"p1",status:"accepted",kind:"policy",label:`retention ${id}`,description:"data lifecycle"}));

test("backfill advances a durable cursor in bounded restartable batches", async () => {
 const tx=fakeTx(nodes);
 const a=await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 assert.equal(a.processed,2);assert.equal(a.status,"running");assert.equal(tx.state.row.cursorNodeId,"b");
 const b=await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 assert.equal(b.processed,2);assert.equal(tx.state.row.cursorNodeId,"d");
 const c=await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 assert.equal(c.processed,1);assert.equal(c.done,true);assert.equal(c.indexedCount,5);
 assert.equal(tx.state.docs.size,5);assert.equal(tx.state.row.normalizerVersion,ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION);
});
test("completed backfill is idempotent and does not rescan", async () => {
 const tx=fakeTx(nodes.slice(0,1));
 await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 const again=await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1"});
 assert.equal(again.processed,0);assert.equal(again.indexedCount,1);
});
test("backfill rejects unscoped work and concurrent cursor advancement", async () => {
 const tx=fakeTx(nodes);await assert.rejects(()=>backfillOrganizationMemorySearchIndexBatch(tx,{}),TypeError);
 const conflict=fakeTx(nodes);conflict.organizationMemorySearchIndexState.updateMany=async()=>({count:0});
 await assert.rejects(()=>backfillOrganizationMemorySearchIndexBatch(conflict,{projectId:"p1"}),/changed concurrently/);
});

test("readiness gate blocks missing, stale and incomplete project indexes", async () => {
 const result=await getOrganizationMemorySearchIndexReadiness({
  projectIds:["p1","p2","p3","p4"],
  findMany:async()=>[
   {projectId:"p1",status:"completed",normalizerVersion:ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION},
   {projectId:"p2",status:"running",normalizerVersion:ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION},
   {projectId:"p3",status:"completed",normalizerVersion:ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION-1},
  ],
 });
 assert.equal(result.ready,false);
 assert.deepEqual(result.missingProjectIds,["p4"]);
 assert.deepEqual(result.incompleteProjectIds,["p2"]);
 assert.deepEqual(result.staleProjectIds,["p3"]);
});
test("normalizer upgrades can restart a completed project backfill", async () => {
 const tx=fakeTx(nodes.slice(0,1));
 await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 tx.state.row.normalizerVersion=ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION-1;
 const reset=await backfillOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
 assert.equal(reset.done,true);
 assert.equal(reset.indexedCount,1);
 assert.equal(tx.state.row.normalizerVersion,ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION);
});
