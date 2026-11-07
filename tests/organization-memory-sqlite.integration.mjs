import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
  replaceOrganizationMemorySearchDocument,
  compareOrganizationMemorySearchDocument,
} from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";
import { repairOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-repair.mjs";
import { reconcileOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-reconciliation.mjs";
import { getOrganizationMemorySearchIndexReadiness } from "../src/lib/knowledge-graph/organization-memory-search-backfill.mjs";

const db = new PrismaClient();
const suffix = "sqlite-index-" + process.pid + "-" + Date.now();
let project;

test("SQLite persistent organization-memory repair and reconciliation lifecycle", async (t) => {
  t.after(async () => {
    if (project) await db.project.deleteMany({ where: { id: project.id } });
    await db.$disconnect();
  });

  project = await db.project.create({
    data: { name: suffix, brief: "SQLite organization memory integration fixture" },
  });
  const nodes = await Promise.all([
    db.knowledgeNode.create({ data: {
      projectId: project.id, nodeRef: "SQLITE-A", kind: "policy",
      label: "Canonical retention policy", description: "Keep evidence safely", status: "accepted",
    } }),
    db.knowledgeNode.create({ data: {
      projectId: project.id, nodeRef: "SQLITE-B", kind: "risk",
      label: "Canonical access risk", description: "Restrict sensitive access", status: "proposed",
    } }),
  ]);
  await db.organizationMemorySearchIndexState.create({ data: {
    projectId: project.id,
    normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    status: "completed",
    reconciliationStatus: "pending",
  } });
  await db.$transaction(async (tx) => {
    for (const node of nodes) await replaceOrganizationMemorySearchDocument(tx, node);
  });

  const repair = (phase, cursor = null) => db.$transaction(
    (tx) => repairOrganizationMemorySearchIndexBatch(tx, {
      projectId: project.id, phase, cursor, batchSize: 10,
    }),
    { isolationLevel: "Serializable" },
  );
  const repairedNodes = await repair("nodes");
  assert.equal(repairedNodes.nextPhase, "documents");
  assert.equal(repairedNodes.repairedNodes, 2);
  const repairedDocuments = await repair("documents");
  assert.equal(repairedDocuments.status, "completed");
  assert.equal(repairedDocuments.removedOrphanDocuments, 0);

  const reconcile = (restart = false) => db.$transaction(
    (tx) => reconcileOrganizationMemorySearchIndexBatch(tx, {
      projectId: project.id, batchSize: 10, restart,
    }),
    { isolationLevel: "Serializable" },
  );
  assert.equal((await reconcile()).phase, "documents");
  assert.equal((await reconcile()).status, "completed");

  const readiness = () => getOrganizationMemorySearchIndexReadiness({
    projectIds: [project.id],
    findMany: (args) => db.organizationMemorySearchIndexState.findMany(args),
  });
  assert.equal((await readiness()).ready, true);

  // Simulate out-of-band source drift: the audit must fail closed.
  await db.knowledgeNode.update({
    where: { id: nodes[0].id }, data: { label: "Changed canonical retention policy" },
  });
  assert.equal((await reconcile(true)).phase, "documents");
  const dirty = await reconcile();
  assert.equal(dirty.status, "failed");
  assert.ok(dirty.mismatchCount > 0);
  assert.equal((await readiness()).ready, false);

  // Repair is derived-only: it rebuilds the document from the source node.
  const repairAgain = await repair("nodes");
  assert.equal(repairAgain.repairedNodes, 2);
  await repair("documents");
  const source = await db.knowledgeNode.findUnique({ where: { id: nodes[0].id } });
  const document = await db.organizationMemorySearchDocument.findUnique({ where: { nodeId: nodes[0].id } });
  assert.equal(compareOrganizationMemorySearchDocument(source, document).matches, true);
  assert.equal(source.label, "Changed canonical retention policy");

  assert.equal((await reconcile()).phase, "documents");
  assert.equal((await reconcile()).status, "completed");
  assert.equal((await readiness()).ready, true);
});
