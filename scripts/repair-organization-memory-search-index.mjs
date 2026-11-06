#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { repairOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-repair.mjs";

const prisma = new PrismaClient();
const rawBatch = Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1]);
const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, 500) : 100;

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
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } }, orderBy: { id: "asc" }, select: { id: true },
  });
  let repairedNodes = 0, removedOrphanDocuments = 0, blockedProjects = 0, projectsCompleted = 0;
  for (const project of projects) {
    let phase = "nodes", cursor = null, done = false, blocked = false;
    while (!done) {
      const result = await runBatch({ projectId: project.id, phase, cursor });
      console.log(JSON.stringify(result));
      if (result.status === "blocked") { blockedProjects += 1; blocked = true; break; }
      repairedNodes += result.repairedNodes ?? 0;
      removedOrphanDocuments += result.removedOrphanDocuments ?? 0;
      phase = result.nextPhase;
      cursor = result.nextCursor;
      done = result.done;
    }
    if (!blocked && done) projectsCompleted += 1;
  }
  console.log(JSON.stringify({
    projects: projects.length, projectsCompleted, blockedProjects, repairedNodes,
    removedOrphanDocuments, batchSize, status: blockedProjects ? "attention_required" : "completed",
    nextStep: "Run db:reconcile:organization-memory-index; indexed reads remain blocked until a clean audit completes.",
  }));
  if (blockedProjects) process.exitCode = 1;
}

main()
  .catch((error) => { console.error("[organization-memory-index-repair] failed", error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
