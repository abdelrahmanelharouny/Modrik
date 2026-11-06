#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { reconcileOrganizationMemorySearchIndexBatch } from "../src/lib/knowledge-graph/organization-memory-search-reconciliation.mjs";

const prisma = new PrismaClient();
const rawBatch = Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1]);
const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, 500) : 100;
const restart = process.argv.includes("--restart");

async function main() {
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let completed = 0, failed = 0, blocked = 0, totalProcessed = 0;
  for (const project of projects) {
    let done = false, first = true;
    while (!done) {
      let result;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          result = await prisma.$transaction(
            (tx) => reconcileOrganizationMemorySearchIndexBatch(tx, {
              projectId: project.id, batchSize, restart: restart && first,
            }),
            { isolationLevel: "Serializable" },
          );
          break;
        } catch (error) {
          if (attempt === 3 || !String(error?.message ?? error).includes("changed concurrently")) throw error;
        }
      }
      first = false;
      totalProcessed += result.processed ?? 0;
      console.log(JSON.stringify(result));
      if (result.status === "blocked") { blocked += 1; done = true; }
      else if (result.status === "failed") { failed += 1; done = true; }
      else if (result.status === "completed") { completed += 1; done = true; }
      else done = result.done === true;
    }
  }
  console.log(JSON.stringify({ projects: projects.length, completed, failed, blocked, totalProcessed, status: failed || blocked ? "attention_required" : "completed" }));
  if (failed || blocked) process.exitCode = 1;
}

main()
  .catch((error) => { console.error("[organization-memory-index-reconciliation] failed", error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
