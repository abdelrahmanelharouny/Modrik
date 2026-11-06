import {
  ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
  compareOrganizationMemorySearchDocument,
} from "./organization-memory-search-index.mjs";
import { tokenizeOrganizationMemoryText } from "./organization-memory-retrieval.mjs";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

function frequenciesFor(node) {
  const frequencies = new Map();
  for (const term of tokenizeOrganizationMemoryText([node.label, node.description, node.kind].filter(Boolean).join(" "))) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  return frequencies;
}

function countFindings(counts) {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

/**
 * Read-only integrity audit for one project. Run inside a Serializable Prisma
 * transaction. One invocation advances exactly one bounded keyset batch.
 */
export async function reconcileOrganizationMemorySearchIndexBatch(tx, input = {}) {
  if (!tx?.organizationMemorySearchIndexState || !tx?.knowledgeNode ||
      !tx?.organizationMemorySearchDocument || !tx?.organizationMemorySearchPosting) {
    throw new TypeError("A transaction client with all organization-memory index models is required.");
  }
  if (typeof input.projectId !== "string" || !input.projectId.trim()) {
    throw new TypeError("A projectId is required for scoped reconciliation.");
  }
  const requested = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(requested) && requested > 0
    ? Math.min(requested, MAX_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  const state = await tx.organizationMemorySearchIndexState.upsert({
    where: { projectId: input.projectId },
    create: {
      projectId: input.projectId,
      normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
      status: "pending",
      reconciliationStatus: "pending",
      reconciliationPhase: "nodes",
    },
    update: {},
  });
  if (state.status !== "completed" || state.normalizerVersion !== ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION) {
    return {
      projectId: input.projectId, status: "blocked", reason: "backfill_incomplete",
      backfillStatus: state.status, normalizerVersion: state.normalizerVersion,
      processed: 0, mismatchCount: state.reconciliationMismatchCount ?? 0,
    };
  }
  if (state.reconciliationStatus === "completed" &&
      state.reconciliationNormalizerVersion === ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION &&
      !input.restart) {
    return {
      projectId: input.projectId, status: "completed", done: true, processed: 0,
      mismatchCount: state.reconciliationMismatchCount, phase: "completed",
    };
  }
  if (state.reconciliationStatus === "failed" && !input.restart) {
    return {
      projectId: input.projectId, status: "failed", done: true, processed: 0,
      mismatchCount: state.reconciliationMismatchCount, phase: state.reconciliationPhase,
      requiresRestart: true,
    };
  }

  const fresh = input.restart ||
    state.reconciliationStatus !== "running" ||
    state.reconciliationNormalizerVersion !== ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION;
  const phase = fresh ? "nodes" : state.reconciliationPhase;
  const nodeCursor = fresh ? null : state.reconciliationCursorNodeId;
  const documentCursor = fresh ? null : state.reconciliationCursorDocumentId;
  let mismatchCount = fresh ? 0 : state.reconciliationMismatchCount;
  const findings = {
    missingDocuments: 0,
    staleDocuments: 0,
    missingPostings: 0,
    unexpectedPostings: 0,
    incorrectFrequencies: 0,
    orphanDocuments: 0,
  };
  let processed = 0;
  let nextPhase = phase;
  let nextNodeCursor = nodeCursor;
  let nextDocumentCursor = documentCursor;
  let done = false;

  if (phase === "nodes") {
    const nodes = await tx.knowledgeNode.findMany({
      where: { projectId: input.projectId, ...(nodeCursor ? { id: { gt: nodeCursor } } : {}) },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, projectId: true, status: true, kind: true, label: true, description: true },
    });
    if (!Array.isArray(nodes)) throw new TypeError("KnowledgeNode adapter must return an array.");
    processed = nodes.length;
    const documents = nodes.length ? await tx.organizationMemorySearchDocument.findMany({
      where: { projectId: input.projectId, nodeId: { in: nodes.map((node) => node.id) } },
      select: { id: true, nodeId: true, projectId: true, status: true, normalizedText: true, tokenCount: true, contentHash: true, normalizerVersion: true },
    }) : [];
    const byNode = new Map(documents.map((document) => [document.nodeId, document]));
    const documentIds = documents.map((document) => document.id);
    const postings = documentIds.length ? await tx.organizationMemorySearchPosting.findMany({
      where: { documentId: { in: documentIds } },
      select: { id: true, documentId: true, term: true, frequency: true },
      orderBy: [{ documentId: "asc" }, { term: "asc" }],
    }) : [];
    const byDocument = new Map();
    for (const posting of postings) {
      if (!byDocument.has(posting.documentId)) byDocument.set(posting.documentId, []);
      byDocument.get(posting.documentId).push(posting);
    }

    for (const node of nodes) {
      const document = byNode.get(node.id);
      if (!document) {
        findings.missingDocuments += 1;
        continue;
      }
      if (!compareOrganizationMemorySearchDocument(node, document).matches) findings.staleDocuments += 1;
      const expected = frequenciesFor(node);
      const actual = new Map();
      for (const posting of byDocument.get(document.id) ?? []) {
        if (typeof posting.term !== "string" || !Number.isSafeInteger(posting.frequency) || posting.frequency < 1) {
          findings.incorrectFrequencies += 1;
          continue;
        }
        actual.set(posting.term, posting.frequency);
      }
      for (const [term, frequency] of expected) {
        if (!actual.has(term)) findings.missingPostings += 1;
        else if (actual.get(term) !== frequency) findings.incorrectFrequencies += 1;
      }
      for (const term of actual.keys()) if (!expected.has(term)) findings.unexpectedPostings += 1;
    }
    if (nodes.length) nextNodeCursor = nodes[nodes.length - 1].id;
    if (nodes.length < batchSize) {
      nextPhase = "documents";
      nextDocumentCursor = null;
    }
  } else if (phase === "documents") {
    const documents = await tx.organizationMemorySearchDocument.findMany({
      where: { projectId: input.projectId, ...(documentCursor ? { id: { gt: documentCursor } } : {}) },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, nodeId: true, projectId: true },
    });
    if (!Array.isArray(documents)) throw new TypeError("Search-document adapter must return an array.");
    processed = documents.length;
    const nodes = documents.length ? await tx.knowledgeNode.findMany({
      where: { projectId: input.projectId, id: { in: documents.map((document) => document.nodeId) } },
      select: { id: true },
    }) : [];
    const sourceIds = new Set(nodes.map((node) => node.id));
    for (const document of documents) if (!sourceIds.has(document.nodeId)) findings.orphanDocuments += 1;
    if (documents.length) nextDocumentCursor = documents[documents.length - 1].id;
    if (documents.length < batchSize) {
      nextPhase = "completed";
      done = true;
    }
  } else {
    throw new Error("Unknown reconciliation phase; restart the audit.");
  }

  const addedFindings = countFindings(findings);
  mismatchCount += addedFindings;
  const nextStatus = done ? (mismatchCount === 0 ? "completed" : "failed") : "running";
  const changed = await tx.organizationMemorySearchIndexState.updateMany({
    where: {
      projectId: input.projectId,
      status: state.status,
      normalizerVersion: state.normalizerVersion,
      reconciliationStatus: state.reconciliationStatus,
      reconciliationPhase: state.reconciliationPhase,
      reconciliationCursorNodeId: state.reconciliationCursorNodeId,
      reconciliationCursorDocumentId: state.reconciliationCursorDocumentId,
      reconciliationMismatchCount: state.reconciliationMismatchCount,
    },
    data: {
      reconciliationStatus: nextStatus,
      reconciliationPhase: nextPhase,
      reconciliationCursorNodeId: nextNodeCursor,
      reconciliationCursorDocumentId: nextDocumentCursor,
      reconciliationMismatchCount: mismatchCount,
      reconciliationNormalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
      reconciliationStartedAt: fresh ? new Date() : (state.reconciliationStartedAt ?? new Date()),
      reconciliationCompletedAt: done ? new Date() : null,
    },
  });
  if (changed.count !== 1) throw new Error("Reconciliation cursor changed concurrently; retry the transaction.");

  return {
    projectId: input.projectId,
    status: nextStatus,
    phase: nextPhase,
    done,
    processed,
    batchSize,
    mismatchCount,
    findings,
    nodeCursorNodeId: nextNodeCursor,
    documentCursorId: nextDocumentCursor,
    normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
  };
}
