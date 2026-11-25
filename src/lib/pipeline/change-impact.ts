import { db } from "@/lib/db";
import { normalizeChangeImpactInput } from "./change-impact.mjs";

export async function enqueueChangeImpactJob(input: {
  projectId: string; source: "github" | "jira" | "manual" | "scheduled"; idempotencyKey: string;
  signal: string; externalKey?: string; externalUrl?: string; title?: string;
}) {
  const value = normalizeChangeImpactInput(input);
  const maxRaw = Number(process.env.PIPELINE_JOB_MAX_ATTEMPTS ?? 5);
  const maxAttempts = Number.isSafeInteger(maxRaw) ? Math.max(1, Math.min(12, maxRaw)) : 5;
  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.agentJob.findUnique({ where: { idempotencyKey: value.idempotencyKey }, select: { id: true, status: true, pipelineRunId: true } });
      if (existing) return { jobId: existing.id, runId: existing.pipelineRunId, status: existing.status, duplicate: true };
      const syncMap = await tx.syncMap.create({ data: {
        projectId: value.projectId,
        kind: value.source === "manual" ? "manual-drift" : value.source === "scheduled" ? "scheduled-drift" : value.source + "-webhook",
        direction: "pending", localLabel: "CHANGE_IMPACT",
        externalKey: value.externalKey, externalUrl: value.externalUrl,
        title: value.title, idempotencyKey: value.idempotencyKey, leaseExpiresAt: null,
      } });
      const run = await tx.pipelineRun.create({ data: { projectId: value.projectId, stage: "DRIFT", status: "running" } });
      const job = await tx.agentJob.create({ data: {
        projectId: value.projectId, pipelineRunId: run.id, stage: "DRIFT", jobKind: "change_impact",
        idempotencyKey: value.idempotencyKey, status: "queued",
        payload: JSON.stringify({ source: value.source, signal: value.signal, syncMapId: syncMap.id, externalKey: value.externalKey, externalUrl: value.externalUrl, title: value.title }),
        maxAttempts,
      } });
      await tx.decisionEntry.create({ data: {
        projectId: value.projectId, stage: "DRIFT", actor: "system", action: "change_impact_queued",
        detail: JSON.stringify({ jobId: job.id, syncMapId: syncMap.id, source: value.source, externalKey: value.externalKey }),
      } });
      return { jobId: job.id, runId: run.id, status: job.status, duplicate: false };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      const existing = await db.agentJob.findUnique({ where: { idempotencyKey: value.idempotencyKey }, select: { id: true, status: true, pipelineRunId: true } });
      if (existing) return { jobId: existing.id, runId: existing.pipelineRunId, status: existing.status, duplicate: true };
    }
    throw error;
  }
}
