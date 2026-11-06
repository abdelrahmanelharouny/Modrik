#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { repairOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-repair.mjs";

const prisma = new PrismaClient();
const rawBatch = Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1]);
const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, 500) : 100;
const projectId = process.argv.find((arg) => arg.startsWith("--project-id="))?.slice("--project-id=".length);
const allProjects = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");

async function previewProject(project) {
  let nodeCount = 0, documentCount = 0, orphanDocumentCount = 0, orphanPostingCount = 0;
  let nodeCursor = null, documentCursor = null;
  while (true) {
    const rows = await prisma.knowledgeNode.findMany({
      where: { projectId: project.id, ...(nodeCursor ? { id: { gt: nodeCursor } } : {}) },
      orderBy: { id: "asc" }, take: batchSize, select: { id: true },
    });
    nodeCount += rows.length;
    if (rows.length < batchSize) break;
    nodeCursor = rows[rows.length - 1].id;
  }
  while (true) {
    const documents = await prisma.organizationMemorySearchDocument.findMany({
      where: { projectId: project.id, ...(documentCursor ? { id: { gt: documentCursor } } : {}) },
      orderBy: { id: "asc" }, take: batchSize, select: { id: true, nodeId: true },
    });
    documentCount += documents.length;
    if (documents.length) {
      const sources = await prisma.knowledgeNode.findMany({
        where: { projectId: project.id, id: { in: documents.map((doc) => doc.nodeId) } },
        select: { id: true },
      });
      const sourceIds = new Set(sources.map((node) => node.id));
      const orphans = documents.filter((doc) => !sourceIds.has(doc.nodeId));
      orphanDocumentCount += orphans.length;
      if (orphans.length) orphanPostingCount += await prisma.organizationMemorySearchPosting.count({
        where: { documentId: { in: orphans.map((doc) => doc.id) } },
      });
    }
    if (documents.length < batchSize) break;
    documentCursor = documents[documents.length - 1].id;
  }
  return {
    projectId: project.id, mode: "dry_run", advisoryOnly: true,
    nodeCount, documentCount, orphanDocumentCount, orphanPostingCount,
    note: "Read-only estimate; concurrent writes may change counts before an actual repair.",
  };
}

async function runBatch(input) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => repairOrganizationMemorySearchIndexBatch(tx, { ...input, batchSize }),
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const retryable = /P2034|serialization|deadlock|changed concurrently/i.test(String(error?.message ?? error));
      if (!retryable || attempt === 3) throw error;
    }
  }
  throw new Error("Repair batch exhausted its retry budget.");
}

async function main() {
  if (Boolean(projectId) === allProjects) {
    throw new Error("Choose exactly one scope: --project-id=<id> or --all. Use --dry-run to preview without writes.");
  }
  if (projectId && !projectId.trim()) throw new Error("--project-id must not be empty.");
  const projects = await prisma.project.findMany({
    where: { ...(projectId ? { id: projectId } : {}), status: { not: "archived" } },
    orderBy: { id: "asc" }, select: { id: true },
  });
  if (!projects.length) throw new Error("No non-archived project matched the requested repair scope.");
  if (dryRun) {
    for (const project of projects) console.log(JSON.stringify(await previewProject(project)));
    console.log(JSON.stringify({
      projects: projects.length, mode: "dry_run", writesPerformed: 0,
      note: "Review the estimate, then rerun with the same explicit scope without --dry-run.",
    }));
    return;
  }

  let repairedNodes = 0, removedOrphanDocuments = 0, removedOrphanPostings = 0;
  let blockedProjects = 0, projectsCompleted = 0;
  for (const project of projects) {
    let phase = "nodes", cursor = null, done = false, blocked = false;
    while (!done) {
      const result = await runBatch({ projectId: project.id, phase, cursor });
      console.log(JSON.stringify(result));
      if (result.status === "blocked") { blockedProjects += 1; blocked = true; break; }
      repairedNodes += result.repairedNodes ?? 0;
      removedOrphanDocuments += result.removedOrphanDocuments ?? 0;
      removedOrphanPostings += result.removedOrphanPostings ?? 0;
      phase = result.nextPhase;
      cursor = result.nextCursor;
      done = result.done;
    }
    if (!blocked && done) projectsCompleted += 1;
  }
  console.log(JSON.stringify({
    projects: projects.length, projectsCompleted, blockedProjects, repairedNodes,
    removedOrphanDocuments, removedOrphanPostings, batchSize,
    status: blockedProjects ? "attention_required" : "completed",
    nextStep: "Run db:reconcile:organization-memory-index; indexed reads remain blocked until a clean audit completes.",
  }));
  if (blockedProjects) process.exitCode = 1;
}

main()
  .catch((error) => { console.error("[organization-memory-index-repair] failed", error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
