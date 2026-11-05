import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const suffix = `org-memory-${process.pid}-${Date.now()}`;
let orgA, orgB, user, projectA, projectB, nodeA;

test("PostgreSQL organization memory is tenant-isolated and governance writes are atomic", async (t) => {
  t.after(async () => {
    if (orgA) await db.organizationAuditEvent.deleteMany({ where: { organizationId: orgA.id } });
    if (orgB) await db.organizationAuditEvent.deleteMany({ where: { organizationId: orgB.id } });
    if (projectA) await db.project.deleteMany({ where: { id: projectA.id } });
    if (projectB) await db.project.deleteMany({ where: { id: projectB.id } });
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
