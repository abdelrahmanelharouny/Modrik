import { createHash } from "node:crypto";
import { db } from "../src/lib/db";
import { enqueueChangeImpactJob } from "../src/lib/pipeline/change-impact";

function readInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(raw) ? Math.max(min, Math.min(max, raw)) : fallback;
}
async function main() {
  const lookbackHours = readInt("DRIFT_SWEEP_LOOKBACK_HOURS", 48, 1, 168);
  const maxRevisions = readInt("DRIFT_SWEEP_MAX_REVISIONS", 250, 1, 1000);
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const scanLimit = Math.min(Math.max(maxRevisions * 5, 500), 5000);
  // Newest-first scan plus idempotency filtering prevents the same oldest batch
  // from permanently starving newer evidence revisions on every scheduled run.
  const revisions = await db.evidenceRevision.findMany({
    where: { createdAt: { gte: since }, consent: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: scanLimit,
    include: { evidence: { select: {
      id: true, code: true, title: true, sourceType: true, language: true, projectId: true,
      project: { select: { id: true, name: true, status: true, reqs: { where: { status: "approved" }, select: { id: true }, take: 1 } } },
    } } },
  });
  const keyByRevision = new Map(revisions.map((revision) => [
    revision.id,
    "scheduled-drift:evidence-revision:" + createHash("sha256").update(revision.id).digest("hex").slice(0, 24),
  ]));
  const candidateKeys = [...keyByRevision.values()];
  const existingKeys = new Set<string>();
  for (let offset = 0; offset < candidateKeys.length; offset += 500) {
    const chunk = candidateKeys.slice(offset, offset + 500);
    const existing = await db.agentJob.findMany({
      where: { idempotencyKey: { in: chunk } },
      select: { idempotencyKey: true },
    });
    for (const row of existing) if (row.idempotencyKey) existingKeys.add(row.idempotencyKey);
  }
  let queued = 0, duplicates = 0, skipped = 0;
  for (const revision of revisions) {
  for (const revision of revisions) {
    const evidence = revision.evidence, project = evidence?.project;
    if (!project || project.status === "archived" || !project.reqs.length || !revision.content.trim()) { skipped += 1; continue; }
    const signal = [
      "Scheduled continuous drift review of a newly changed, explicitly AI-consented evidence revision.",
      "Project: " + project.name.slice(0, 120),
      "Source: " + evidence.code + " — " + evidence.title.slice(0, 160) + " (" + evidence.sourceType + ", " + revision.language + ")",
      "Revision: " + revision.version + "; change note: " + revision.changeNote.slice(0, 300),
      "Changed evidence excerpt: " + revision.content.slice(0, 1050),
      "Compare this changed evidence only against approved requirements. Return provisional candidates; never edit or approve requirements.",
    ].join("\n");
    const idempotencyKey = keyByRevision.get(revision.id)!;
    if (existingKeys.has(idempotencyKey)) { duplicates += 1; continue; }
    if (queued >= maxRevisions) break;
    const result = await enqueueChangeImpactJob({
      projectId: evidence.projectId, source: "scheduled",
      idempotencyKey,
      externalKey: "evidence-revision:" + revision.id,
      title: "Scheduled evidence drift: " + evidence.code, signal: signal.slice(0, 2000),
    });
    if (result.duplicate) duplicates += 1; else queued += 1;
  }
  process.stdout.write(JSON.stringify({
    ok: true, since: since.toISOString(), lookbackHours, revisionsSeen: revisions.length,
    queued, duplicates, skipped, maxRevisions, scanned: revisions.length, scanLimit,
    note: "Only explicitly AI-consented evidence revisions with at least one approved requirement are queued. The existing pipeline worker performs analysis; humans retain all decisions.",
  }, null, 2) + "\n");
}
main().catch((error) => {
  process.stderr.write("Continuous drift sweep failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}).finally(async () => { await db.$disconnect(); });
