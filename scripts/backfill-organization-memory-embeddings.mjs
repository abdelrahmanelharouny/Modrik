#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { enqueueOrganizationMemoryEmbeddingWork } from "../src/lib/knowledge-graph/organization-memory-embedding-outbox.mjs";

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const hasAll = args.includes("--all");
const projectArg = args.find((arg) => arg.startsWith("--project-id="));
const dryRun = args.includes("--dry-run");
const batchArg = Number(args.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1]);
const batchSize = Number.isSafeInteger(batchArg) && batchArg > 0 ? Math.min(batchArg, 500) : 100;
const model = String(process.env.ORGANIZATION_MEMORY_EMBEDDING_MODEL ?? "").trim();
const dimensions = Number(process.env.ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS);

async function main() {
  if (hasAll === Boolean(projectArg)) throw new Error("Pass exactly one of --project-id=<id> or --all.");
  if (!model || !Number.isSafeInteger(dimensions) || dimensions < 2 || dimensions > 8192) throw new Error("Embedding model and dimensions must be configured.");
  const projects = await prisma.project.findMany({
    where: { status: { not: "archived" }, organizationId: { not: null }, ...(projectArg ? { id: projectArg.split("=")[1] } : {}) },
    orderBy: { id: "asc" }, select: { id: true, organizationId: true },
  });
  if (projectArg && projects.length !== 1) throw new Error("The requested active organization-owned project was not found.");
  let scanned = 0, queued = 0, pages = 0;
  for (const project of projects) {
    let cursor = null;
    while (true) {
      const nodes = await prisma.knowledgeNode.findMany({
        where: { projectId: project.id, status: "accepted", ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: "asc" }, take: batchSize,
        select: { id: true, projectId: true, status: true, kind: true, label: true, description: true, updatedAt: true },
      });
      if (!nodes.length) break;
      pages += 1; scanned += nodes.length;
      if (!dryRun) {
        const result = await prisma.$transaction(async (tx) => {
          let count = 0;
          for (const node of nodes) {
            const work = await enqueueOrganizationMemoryEmbeddingWork(tx, {
              enabled: true, organizationId: project.organizationId, model, dimensions, node,
            });
            if (work.queued) count += 1;
          }
          return count;
        }, { isolationLevel: "Serializable" });
        queued += result;
      }
      cursor = nodes[nodes.length - 1].id;
      console.log(JSON.stringify({ projectId: project.id, scanned, queued, pages, dryRun }));
      if (nodes.length < batchSize) break;
    }
  }
  console.log(JSON.stringify({ projects: projects.length, scanned, queued, pages, dryRun, model, dimensions }));
}

main().catch((error) => {
  console.error("[organization-memory-embedding-backfill] failed", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());