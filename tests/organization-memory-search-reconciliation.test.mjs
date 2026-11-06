import test from "node:test";
import assert from "node:assert/strict";
import { reconcileOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-reconciliation.mjs";
import { replaceOrganizationMemorySearchDocument, ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION } from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";

function makeTx(sourceNodes, options = {}) {
  const state = {
    projectId: "p1", status: "completed", normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    reconciliationStatus: "pending", reconciliationPhase: "nodes",
    reconciliationCursorNodeId: null, reconciliationCursorDocumentId: null,
    reconciliationMismatchCount: 0, reconciliationNormalizerVersion: 0,
    reconciliationStartedAt: null, reconciliationCompletedAt: null,
  };
  const docs = new Map();
  const postings = new Map();
  let nextId = 1;
  const tx = {
    state, docs, postings,
    organizationMemorySearchIndexState: {
      upsert: async () => state,
      updateMany: async ({ where, data }) => {
        if (where.projectId !== state.projectId || where.status !== state.status ||
            where.normalizerVersion !== state.normalizerVersion ||
            where.reconciliationStatus !== state.reconciliationStatus ||
            where.reconciliationPhase !== state.reconciliationPhase ||
            where.reconciliationCursorNodeId !== state.reconciliationCursorNodeId ||
            where.reconciliationCursorDocumentId !== state.reconciliationCursorDocumentId ||
            where.reconciliationMismatchCount !== state.reconciliationMismatchCount) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      },
    },
    knowledgeNode: {
      findMany: async ({ where, take, select }) => {
        let rows = sourceNodes.filter((node) => node.projectId === where.projectId);
        if (where.id?.gt) rows = rows.filter((node) => node.id > where.id.gt);
        if (where.id?.in) rows = rows.filter((node) => where.id.in.includes(node.id));
        rows.sort((a,b) => a.id.localeCompare(b.id));
        return rows.slice(0, take ?? rows.length).map(node => select?.id ? {id:node.id} : node);
      },
    },
    organizationMemorySearchDocument: {
      upsert: async ({ where, create, update }) => {
        const old=docs.get(where.nodeId);
        const doc={id:old?.id??"doc-"+where.nodeId,...create,...(old?update:{})};
        docs.set(where.nodeId,doc); return {id:doc.id};
      },
      findMany: async ({ where, take }) => {
        let rows=[...docs.values()].filter(doc=>doc.projectId===where.projectId);
        if(where.nodeId?.in) rows=rows.filter(doc=>where.nodeId.in.includes(doc.nodeId));
        if(where.id?.gt) rows=rows.filter(doc=>doc.id>where.id.gt);
        rows.sort((a,b)=>a.id.localeCompare(b.id));
        return rows.slice(0,take??rows.length);
      },
    },
    organizationMemorySearchPosting: {
      deleteMany: async ({where}) => postings.set(where.documentId,[]),
      createMany: async ({data}) => { const id=data[0]?.documentId;if(id)postings.set(id,data);return {count:data.length}; },
      findMany: async ({where}) => [...postings.entries()].filter(([id])=>where.documentId.in.includes(id)).flatMap(([,rows])=>rows),
    },
  };
  return tx;
}
const nodes = [
  {id:"n1",projectId:"p1",status:"accepted",kind:"policy",label:"Data retention",description:"Keep records"},
  {id:"n2",projectId:"p1",status:"rejected",kind:"risk",label:"سياسة البيانات",description:"تخزين آمن"},
  {id:"n3",projectId:"p1",status:"accepted",kind:"decision",label:"Code switch policy",description:"سياسة access"},
];

async function indexAll(tx) {
  for (const node of nodes) await replaceOrganizationMemorySearchDocument(tx,node);
  // write-through invalidates the audit but preserves the completed backfill marker.
  tx.state.status="completed";
  tx.state.reconciliationStatus="pending";
  tx.state.reconciliationPhase="nodes";
  tx.state.reconciliationCursorNodeId=null;
  tx.state.reconciliationCursorDocumentId=null;
  tx.state.reconciliationMismatchCount=0;
  tx.state.reconciliationNormalizerVersion=0;
}

test("full reconciliation audits document fields and exact term-frequency postings in restartable batches", async () => {
  const tx=makeTx(nodes); await indexAll(tx);
  const a=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
  assert.equal(a.status,"running");assert.equal(a.processed,2);assert.equal(a.phase,"nodes");
  const b=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
  assert.equal(b.status,"running");assert.equal(b.phase,"documents");
  const c=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
  assert.equal(c.status,"running");assert.equal(c.phase,"documents");
  const d=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:2});
  assert.equal(d.status,"completed");assert.equal(d.mismatchCount,0);
  assert.equal(tx.state.reconciliationNormalizerVersion,ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION);
  const done=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1"});
  assert.equal(done.processed,0);assert.equal(done.status,"completed");
});

test("reconciliation detects missing/stale documents, missing/unexpected postings and wrong frequencies", async () => {
  const tx=makeTx(nodes); await indexAll(tx);
  tx.docs.delete("n2");
  const doc=tx.docs.get("n1");
  doc.contentHash="wrong";
  const post=tx.postings.get(doc.id);
  post[0].frequency += 4;
  post.push({id:"rogue",documentId:doc.id,term:"not-in-source",frequency:1});
  const a=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:10});
  assert.equal(a.findings.missingDocuments,1);
  assert.equal(a.findings.staleDocuments,1);
  assert.ok(a.findings.missingPostings>0);
  assert.ok(a.findings.unexpectedPostings>0);
  assert.ok(a.findings.incorrectFrequencies>0);
  const b=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:10});
  assert.equal(b.status,"failed");
  assert.ok(b.mismatchCount>0);
});

test("reconciliation detects orphan documents in the independent document pass", async () => {
  const tx=makeTx(nodes); await indexAll(tx);
  tx.docs.set("orphan",{id:"doc-orphan",nodeId:"deleted-node",projectId:"p1",status:"accepted"});
  const a=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:10});
  assert.equal(a.phase,"documents");
  const b=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",batchSize:10});
  assert.equal(b.findings.orphanDocuments,1);
  assert.equal(b.status,"failed");
});

test("reconciliation fails closed before backfill and requires explicit restart after mismatch", async () => {
  const tx=makeTx(nodes);tx.state.status="running";
  const blocked=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1"});
  assert.equal(blocked.status,"blocked");assert.equal(blocked.reason,"backfill_incomplete");
  tx.state.status="completed";tx.state.reconciliationStatus="failed";
  const refused=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1"});
  assert.equal(refused.requiresRestart,true);
  const restarted=await reconcileOrganizationMemorySearchIndexBatch(tx,{projectId:"p1",restart:true,batchSize:10});
  assert.equal(restarted.status,"running");
});
