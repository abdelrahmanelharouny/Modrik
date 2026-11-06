#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  buildOrganizationMemoryEmbeddingClaimFilter,
  buildOrganizationMemoryEmbeddingLease,
  buildOrganizationMemoryEmbeddingRetry,
  buildOrganizationMemoryEmbeddingCompletion,
  classifyOrganizationMemoryEmbeddingWork,
} from "../src/lib/knowledge-graph/organization-memory-embedding-worker.mjs";
import { buildOrganizationMemoryEmbeddingContent } from "../src/lib/knowledge-graph/organization-memory-embeddings.mjs";
import { createOrganizationMemoryEmbeddingProvider } from "../src/lib/knowledge-graph/organization-memory-embedding-provider.mjs";
import {
  persistOrganizationMemoryEmbedding,
  deleteOrganizationMemoryEmbedding,
} from "../src/lib/knowledge-graph/organization-memory-embedding-store.mjs";

const prisma = new PrismaClient();
const workerId = `org-memory-${process.pid}-${randomUUID()}`;
const rawLimit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1]);
const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 100;
let provider;

async function claimOne() {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const filter = buildOrganizationMemoryEmbeddingClaimFilter(now);
    const candidate = await tx.organizationMemoryEmbeddingJob.findFirst({
      where: filter,
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, attempts: true },
    });
    if (!candidate) return null;
    const lease = buildOrganizationMemoryEmbeddingLease({ workerId, now });
    const claimed = await tx.organizationMemoryEmbeddingJob.updateMany({
      where: { id: candidate.id, ...filter },
      data: { ...lease, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) return null;
    return tx.organizationMemoryEmbeddingJob.findFirst({
      where: { id: candidate.id, status: "processing", lockedBy: workerId, lockedAt: now },
    });
  }, { isolationLevel: "Serializable" });
}

async function complete(tx, job) {
  const completion = buildOrganizationMemoryEmbeddingCompletion({
    jobId: job.id, workerId, lockedAt: job.lockedAt,
  });
  const result = await tx.organizationMemoryEmbeddingJob.updateMany(completion);
  if (result.count !== 1) throw new Error("Embedding job lease ownership was lost before completion.");
  return true;
}

async function processJob(job) {
  const project = await prisma.project.findFirst({
    where: { id: job.projectId, organizationId: job.organizationId, status: { not: "archived" } },
    select: { id: true, organizationId: true },
  });
  if (!project || project.organizationId !== job.organizationId) {
    await prisma.$transaction(async (tx) => { await complete(tx, job); });
    return "superseded_project_scope";
  }

  const node = await prisma.knowledgeNode.findFirst({
    where: { id: job.nodeId, projectId: job.projectId },
    select: { id: true, projectId: true, status: true, kind: true, label: true, description: true },
  });
  const classification = classifyOrganizationMemoryEmbeddingWork({
    operation: job.operation,
    nodeId: job.nodeId,
    contentHash: job.contentHash,
    currentNodeStatus: node?.status,
    currentContentHash: node?.status === "accepted" ? buildOrganizationMemoryEmbeddingContent(node).contentHash : null,
  });

  if (classification.action === "superseded") {
    await prisma.$transaction(async (tx) => { await complete(tx, job); });
    return classification.reason;
  }

  if (classification.action === "delete") {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.knowledgeNode.findFirst({
        where: { id: job.nodeId, projectId: job.projectId },
        select: { status: true },
      });
      if (latest?.status !== "accepted") {
        await complete(tx, job);
        await deleteOrganizationMemoryEmbedding(tx, {
          organizationId: job.organizationId, projectId: job.projectId, nodeId: job.nodeId,
          model: job.model, dimensions: job.dimensions,
        });
      } else {
        await complete(tx, job);
      }
    }, { isolationLevel: "Serializable" });
    return "deleted";
  }

  const canonical = buildOrganizationMemoryEmbeddingContent(node);
  provider ??= await createOrganizationMemoryEmbeddingProvider();
  const embedding = await provider.embed(canonical.content);

  return prisma.$transaction(async (tx) => {
    const latestJob = await tx.organizationMemoryEmbeddingJob.findFirst({
      where: { id: job.id, status: "processing", lockedBy: workerId, lockedAt: job.lockedAt },
    });
    if (!latestJob) return "lease_lost";
    const persisted = await persistOrganizationMemoryEmbedding(tx, {
      organizationId: job.organizationId, projectId: job.projectId, nodeId: job.nodeId,
      model: job.model, dimensions: job.dimensions, contentHash: job.contentHash, embedding,
    });
    await complete(tx, job);
    return persisted.persisted ? "embedded" : persisted.reason;
  }, { isolationLevel: "Serializable" });
}

async function retry(job, error) {
  const retryData = buildOrganizationMemoryEmbeddingRetry({
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: error instanceof Error ? error.message : "Embedding worker failed.",
  });
  delete retryData.delayMs;
  await prisma.organizationMemoryEmbeddingJob.updateMany({
    where: { id: job.id, status: "processing", lockedBy: workerId, lockedAt: job.lockedAt },
    data: retryData,
  });
}

async function main() {
  let processed = 0;
  const outcomes = {};
  while (processed < limit) {
    const job = await claimOne();
    if (!job) break;
    try {
      const outcome = await processJob(job);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch (error) {
      await retry(job, error);
      outcomes.retried = (outcomes.retried ?? 0) + 1;
      console.error("[organization-memory-embedding-worker] job failed", {
        jobId: job.id, attempt: job.attempts,
        error: error instanceof Error ? error.message.slice(0, 300) : "unknown error",
      });
    }
    processed += 1;
  }
  console.log(JSON.stringify({ workerId, processed, outcomes }));
}

main()
  .catch((error) => {
    console.error("[organization-memory-embedding-worker] fatal", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
