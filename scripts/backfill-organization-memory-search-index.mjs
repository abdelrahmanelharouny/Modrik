#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { backfillOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-backfill.mjs";

const prisma = new PrismaClient();
const rawBatch = Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1]);
const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, 500) : 100;

async function main() {
  const projects = await prisma.project.findMany({ orderBy: { id: "asc" }, select: { id: true } });
  let projectsCompleted = 0;
  let totalIndexed = 0;
  for (const project of projects) {
    let done = false;
    while (!done) {
      let result;
      // Serializable isolation plus the persisted cursor CAS makes a batch
      // atomic and safe to retry if another worker advanced the same project.
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          result = await prisma.$transaction(
            (tx) => backfillOrganizationMemorySearchIndexBatch(tx, { projectId: project.id, batchSize }),
            { isolationLevel: "Serializable" },
          );
          break;
        } catch (error) {
          if (attempt === 3 || !String(error?.message ?? error).includes("changed concurrently")) throw error;
        }
      }
      totalIndexed += result.processed;
      done = result.done;
      console.log(JSON.stringify({
        projectId: project.id,
        status: result.status,
        processed: result.processed,
        indexedCount: result.indexedCount,
        cursorNodeId: result.cursorNodeId,
        batchSize: result.batchSize,
      }));
    }
    projectsCompleted += 1;
  }
  console.log(JSON.stringify({ projectsCompleted, totalIndexed, batchSize, status: "completed" }));
}

main()
  .catch((error) => {
    console.error("[organization-memory-index-backfill] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
