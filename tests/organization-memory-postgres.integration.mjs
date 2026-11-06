import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { replaceOrganizationMemorySearchDocument, ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION } from "../src/lib/knowledge-graph/organization-memory-search-index.mjs";
import { reconcileOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-reconciliation.mjs";
import { getOrganizationMemorySearchIndexReadiness } from "../src/lib/knowledge-graph/organization-memory-search-backfill.mjs";
import {
  buildOrganizationMemoryPage,
  buildOrganizationMemoryCursorWhere,
  createOrganizationMemoryCursor,
} from "../src/lib/knowledge-graph/organization-memory.mjs";

const db = new PrismaClient();
const suffix = `org-memory-${process.pid}-${Date.now()}`;
let orgA, orgB, user, projectA, projectB, nodeA, auditProject;

test("PostgreSQL organization memory is tenant-isolated and governance writes are atomic", async (t) => {
  t.after(async () => {
    if (orgA) await db.organizationAuditEvent.deleteMany({ where: { organizationId: orgA.id } });
    if (orgB) await db.organizationAuditEvent.deleteMany({ where: { organizationId: orgB.id } });
    if (projectA) await db.project.deleteMany({ where: { id: projectA.id } });
    if (projectB) await db.project.deleteMany({ where: { id: projectB.id } });
    if (auditProject) await db.project.deleteMany({ where: { id: auditProject.id } });
    if (user) await db.user.deleteMany({ where: { id: user.id } });
    if (orgA) await db.organization.deleteMany({ where: { id: orgA.id } });
    if (orgB) await db.organization.deleteMany({ where: { id: orgB.id } });
    await db.$disconnect();
  });

  orgA = await db.organization.create({ data: { name: suffix + " A", slug: suffix + "-a" } });
  orgB = await db.organization.create({ data: { name: suffix + " B", slug: suffix + "-b" } });
  user = await db.user.create({ data: { email: suffix + "@example.test", displayName: "Integration actor" } });
  projectA = await db.project.create({ data: { name: "Tenant A", brief: "Isolation fixture", organizationId: orgA.id } });
  projectB = await db.project.create({ data: { name: "Tenant B", brief: "Isolation fixture", organizationId: orgB.id } });
  nodeA = await db.knowledgeNode.create({ data: {
    projectId: projectA.id, nodeRef: "KM-A", kind: "decision", label: "Tenant A accepted memory", status: "accepted",
  } });
  await db.knowledgeNode.create({ data: {
    projectId: projectB.id, nodeRef: "KM-B", kind: "decision", label: "Tenant B accepted memory", status: "accepted",
  } });

  // Exercise the complete, persisted reconciliation lifecycle on real PostgreSQL.
  // A dedicated project keeps this audit independent from the tenant fixtures below.
  auditProject = await db.project.create({ data: {
    name: "Index reconciliation", brief: "PostgreSQL integrity audit fixture", organizationId: orgA.id,
  } });
  const auditNode = await db.knowledgeNode.create({ data: {
    projectId: auditProject.id, nodeRef: "AUDIT-1", kind: "policy",
    label: "Data retention policy", description: "Keep records safely", status: "accepted",
  } });
  await db.$transaction(async (tx) => {
    await tx.organizationMemorySearchIndexState.create({ data: {
      projectId: auditProject.id, normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
      status: "completed", reconciliationStatus: "pending",
    } });
    await replaceOrganizationMemorySearchDocument(tx, auditNode);
  });
  const reconcile = (restart = false) => db.$transaction(
    (tx) => reconcileOrganizationMemorySearchIndexBatch(tx, {
      projectId: auditProject.id, batchSize: 10, restart,
    }),
    { isolationLevel: "Serializable" },
  );
  const auditFirstBatch = await reconcile();
  assert.equal(auditFirstBatch.status, "running");
  assert.equal(auditFirstBatch.phase, "documents");
  const auditComplete = await reconcile();
  assert.equal(auditComplete.status, "completed");
  assert.equal(auditComplete.mismatchCount, 0);
  const readiness = () => getOrganizationMemorySearchIndexReadiness({
    projectIds: [auditProject.id],
    findMany: (args) => db.organizationMemorySearchIndexState.findMany(args),
  });
  assert.equal((await readiness()).ready, true);

  // A transactional write-through must revoke the previous integrity attestation.
  await db.$transaction((tx) => replaceOrganizationMemorySearchDocument(tx, auditNode));
  assert.equal((await readiness()).ready, false);
  assert.equal((await reconcile(true)).phase, "documents");
  assert.equal((await reconcile()).status, "completed");
  await db.knowledgeNode.update({ where: { id: auditNode.id }, data: { label: "Silently changed source" } });
  assert.equal((await reconcile(true)).phase, "documents");
  const dirtyAudit = await reconcile();
  assert.equal(dirtyAudit.status, "failed");
  assert.ok(dirtyAudit.mismatchCount > 0);
  assert.equal((await readiness()).ready, false);
  await db.organizationAuditEvent.create({ data: {
    organizationId: orgA.id, actorUserId: user.id, eventType: "fixture.created",
    resourceType: "knowledge_node", resourceId: nodeA.id, projectId: projectA.id,
  } });

  const [aMemory, bMemory, aAudit, bAudit] = await Promise.all([
    db.knowledgeNode.findMany({ where: { status: "accepted", project: { organizationId: orgA.id } } }),
    db.knowledgeNode.findMany({ where: { status: "accepted", project: { organizationId: orgB.id } } }),
    db.organizationAuditEvent.findMany({ where: { organizationId: orgA.id } }),
    db.organizationAuditEvent.findMany({ where: { organizationId: orgB.id } }),
  ]);
  assert.deepEqual(aMemory.map((row) => row.nodeRef), ["KM-A"]);
  assert.deepEqual(bMemory.map((row) => row.nodeRef), ["KM-B"]);
  assert.equal(aAudit.length, 1);
  assert.equal(bAudit.length, 0);

  // Exercise real PostgreSQL keyset pagination across equal timestamps. The
  // page boundary must be stable, tenant-scoped, and free of duplicates.
  const pageFixtures = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    db.knowledgeNode.create({ data: {
      projectId: projectA.id, nodeRef: "PAGE-" + index, kind: "decision",
      label: "Pagination fixture " + index, status: "accepted",
    } }),
  ));
  const sharedTimestamp = new Date("2026-11-05T12:00:00.000Z");
  await db.knowledgeNode.updateMany({
    where: { id: { in: pageFixtures.map((node) => node.id) } },
    data: { updatedAt: sharedTimestamp },
  });
  const baseWhere = {
    projectId: { in: [projectA.id] }, status: "accepted",
    nodeRef: { startsWith: "PAGE-" },
  };
  const ordering = [{ updatedAt: "desc" }, { id: "asc" }];
  const firstPage = buildOrganizationMemoryPage({ limit: 2 });
  const firstRows = await db.knowledgeNode.findMany({
    where: baseWhere, take: firstPage.take, orderBy: ordering,
    select: { id: true, updatedAt: true },
  });
  const firstVisible = firstRows.slice(0, firstPage.limit);
  assert.equal(firstVisible.length, 2);
  assert.equal(firstRows.length, 3);
  const cursorToken = createOrganizationMemoryCursor(firstVisible[1]);
  const secondPage = buildOrganizationMemoryPage({ limit: 2, cursor: cursorToken });
  const anchor = await db.knowledgeNode.findFirst({
    where: { ...baseWhere, id: secondPage.cursor.id },
    select: { id: true, updatedAt: true },
  });
  assert.equal(anchor.updatedAt.getTime(), secondPage.cursor.updatedAt.getTime());
  const secondWhere = buildOrganizationMemoryCursorWhere(baseWhere, secondPage, "desc");
  const secondRows = await db.knowledgeNode.findMany({
    where: secondWhere, take: secondPage.take, orderBy: ordering,
    select: { id: true, updatedAt: true },
  });
  const secondVisible = secondRows.slice(0, secondPage.limit);
  assert.equal(secondVisible.length, 2);
  assert.equal(new Set([...firstVisible, ...secondVisible].map((node) => node.id)).size, 4);
  assert.deepEqual(
    [...firstVisible, ...secondVisible].map((node) => node.id),
    [...pageFixtures].sort((a, b) => a.id.localeCompare(b.id)).map((node) => node.id),
  );

  const concurrent = await Promise.all([1, 2].map((reviewer) => db.$transaction(async (tx) => {
    const changed = await tx.knowledgeNode.updateMany({
      where: { id: nodeA.id, projectId: projectA.id, status: "accepted" },
      data: { status: "archived" },
    });
    if (changed.count !== 1) return { reviewer, changed: 0 };
    await tx.decisionEntry.create({ data: {
      projectId: projectA.id, stage: "ORG_MEMORY", actor: "human",
      action: "organization_memory_archive", detail: JSON.stringify({ reviewer }),
    } });
    await tx.organizationAuditEvent.create({ data: {
      organizationId: orgA.id, actorUserId: user.id, eventType: "knowledge_memory.archive",
      resourceType: "knowledge_node", resourceId: nodeA.id, projectId: projectA.id,
    } });
    return { reviewer, changed: 1 };
  })));
  assert.equal(concurrent.filter((result) => result.changed === 1).length, 1);
  assert.equal(concurrent.filter((result) => result.changed === 0).length, 1);
  assert.equal(await db.decisionEntry.count({ where: { projectId: projectA.id, action: "organization_memory_archive" } }), 1);
  assert.equal(await db.organizationAuditEvent.count({ where: { organizationId: orgA.id, eventType: "knowledge_memory.archive" } }), 1);

  const rollbackNode = await db.knowledgeNode.create({ data: {
    projectId: projectA.id, nodeRef: "KM-ROLLBACK", kind: "risk", label: "Rollback fixture", status: "proposed",
  } });
  await assert.rejects(db.$transaction(async (tx) => {
    const changed = await tx.knowledgeNode.updateMany({
      where: { id: rollbackNode.id, projectId: projectA.id, status: "proposed" },
      data: { status: "accepted" },
    });
    assert.equal(changed.count, 1);
    await tx.decisionEntry.create({ data: {
      projectId: projectA.id, stage: "ORG_MEMORY", action: "organization_memory_approve",
    } });
    await tx.organizationAuditEvent.create({ data: {
      organizationId: orgA.id, actorUserId: "missing-actor-" + suffix,
      eventType: "knowledge_memory.approve", resourceType: "knowledge_node",
      resourceId: rollbackNode.id, projectId: projectA.id,
    } });
  }));
  assert.equal((await db.knowledgeNode.findUnique({ where: { id: rollbackNode.id } })).status, "proposed");
  assert.equal(await db.decisionEntry.count({ where: { projectId: projectA.id, action: "organization_memory_approve" } }), 0);
});
