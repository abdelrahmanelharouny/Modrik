import { randomUUID } from "node:crypto";
import { hashEvidenceOperationRequest } from "@/lib/evidence/operation-hash.mjs";
import { hashEvidenceRevision } from "@/lib/evidence/revision.mjs";
import { isEvidenceRevisionVersionConflict, parseExpectedRevisionVersion } from "@/lib/evidence/revision-conflict.mjs";
import { buildEvidenceSnapshotWhere } from "@/lib/evidence/snapshot-where.mjs";
import { isEvidenceCreateReplay } from "@/lib/evidence/create-replay.mjs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";

type Params = { params: Promise<{ id: string }> };

const SOURCE_TYPES = [
  "interview",
  "document",
  "meeting",
  "survey",
  "observation",
  "transcript",
  "whiteboard_ocr",
];

// Evidence without explicit consent remains visible in the library, but its
// content is filtered from every AI prompt. Consent is never inferred.
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid evidence payload" }, { status: 400 });
  }

  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, stageStatus: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) {
    return NextResponse.json({ error: "Evidence cannot change while the current stage is processing. Retry after it completes." }, { status: 409 });
  }

  if (body.consent !== undefined && typeof body.consent !== "boolean") {
    return NextResponse.json({ error: "consent must be a boolean" }, { status: 400 });
  }
  // A browser client cannot turn its own input into trusted simulation evidence.
  if (body.origin === "synthetic") {
    return NextResponse.json(
      { error: "Synthetic evidence can only be created by internal simulation workflows" },
      { status: 400 }
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const sourceType = String(body.sourceType ?? "interview");
  const language = String(body.language ?? "en");
  const consent = body.consent === true;
  const origin = body.origin === "file" ? "file" : "human";

  if (!title || !content) {
    return NextResponse.json({ error: "Title and content are required" }, { status: 400 });
  }
  if (title.length > 200 || content.length > 8000) {
    return NextResponse.json({ error: "Evidence title is limited to 200 characters and content to 8,000 characters" }, { status: 413 });
  }

  // Codes are immutable identifiers, not positions in a list. This removes
  // the count+1 race and prevents unrelated citations from being rebound after deletion.
  const requestedOperationId = typeof body.clientOperationId === "string" ? body.clientOperationId : null;
  if (requestedOperationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOperationId)) {
    return NextResponse.json({ error: "clientOperationId must be a UUID" }, { status: 400 });
  }
  const idempotentId = requestedOperationId ?? randomUUID();
  const normalized = {
    title,
    content,
    sourceType: SOURCE_TYPES.includes(sourceType) ? sourceType : "interview",
    language: ["en", "ar-EG", "codeswitch"].includes(language) ? language : "en",
    consent,
  };
  const contentHash = hashEvidenceRevision(normalized);
  // Durable operation records survive evidence deletion, preventing an old
  // client UUID from silently creating a second source after a delayed retry.
  const requestHash = hashEvidenceOperationRequest({ projectId: id, action: "create", origin, normalized });
  if (requestedOperationId) {
    const priorOperation = await db.evidenceOperation.findUnique({ where: { operationId: idempotentId } });
    if (priorOperation) {
      if (priorOperation.projectId !== id || priorOperation.action !== "create" || priorOperation.requestHash !== requestHash) return NextResponse.json({ error: "Idempotency key was already used for a different operation", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
      if (priorOperation.status !== "completed" || !priorOperation.responseJson) return NextResponse.json({ error: "This operation is still being finalized. Retry with the same idempotency key.", code: "IDEMPOTENCY_IN_PROGRESS" }, { status: 409 });
      const replayEvidenceId = JSON.parse(priorOperation.responseJson).evidenceId;
      if (typeof replayEvidenceId !== "string") return NextResponse.json({ error: "Stored idempotency result is invalid", code: "IDEMPOTENCY_RECORD_INVALID" }, { status: 500 });
      const replayEvidence = await db.evidence.findFirst({ where: { id: replayEvidenceId, projectId: id } });
      if (!replayEvidence) return NextResponse.json({ error: "This operation already completed, but its evidence was subsequently deleted.", code: "IDEMPOTENCY_RESOURCE_DELETED" }, { status: 410 });
      return NextResponse.json({ evidence: replayEvidence, aiEligible: replayEvidence.consent, idempotentReplay: true }, { status: 200 });
    }
    // Backfill exact replays from the pre-ledger implementation.
    const legacyEvidence = await db.evidence.findUnique({ where: { id: idempotentId } });
    if (legacyEvidence) {
      if (!isEvidenceCreateReplay(legacyEvidence, { projectId: id, normalized, origin })) return NextResponse.json({ error: "Idempotency key was already used for a different evidence payload", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
      const replayBody = { evidence: legacyEvidence, aiEligible: legacyEvidence.consent };
      await db.evidenceOperation.create({ data: { operationId: idempotentId, projectId: id, action: "create", requestHash, status: "completed", responseJson: JSON.stringify({ evidenceId: legacyEvidence.id }), completedAt: new Date() } });
      return NextResponse.json({ ...replayBody, idempotentReplay: true }, { status: 200 });
    }
  }
  let evidence;
  try {
    evidence = await db.$transaction(async (tx) => {
      if (requestedOperationId) await tx.evidenceOperation.create({ data: { operationId: idempotentId, projectId: id, action: "create", requestHash, status: "processing" } });
      const created = await tx.evidence.create({ data: { id: idempotentId, projectId: id, code: `E-${idempotentId.slice(0, 8).toUpperCase()}`, ...normalized, origin } });
      await tx.evidenceRevision.create({ data: { evidenceId: created.id, version: 1, ...normalized, contentHash, changeNote: "Initial source capture", createdBy: "human" } });
      if (requestedOperationId) await tx.evidenceOperation.update({ where: { operationId: idempotentId }, data: { status: "completed", responseJson: JSON.stringify({ evidenceId: created.id }), completedAt: new Date() } });
      return created;
    });
  } catch (error) {
    if (requestedOperationId) {
      const racedOperation = await db.evidenceOperation.findUnique({ where: { operationId: idempotentId } });
      if (racedOperation) {
        if (racedOperation.projectId !== id || racedOperation.action !== "create" || racedOperation.requestHash !== requestHash) return NextResponse.json({ error: "Idempotency key was already used for a different operation", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
        if (racedOperation.status === "completed" && racedOperation.responseJson) {
          const replayEvidenceId = JSON.parse(racedOperation.responseJson).evidenceId;
          if (typeof replayEvidenceId !== "string") return NextResponse.json({ error: "Stored idempotency result is invalid", code: "IDEMPOTENCY_RECORD_INVALID" }, { status: 500 });
          const replayEvidence = await db.evidence.findFirst({ where: { id: replayEvidenceId, projectId: id } });
          if (!replayEvidence) return NextResponse.json({ error: "This operation already completed, but its evidence was subsequently deleted.", code: "IDEMPOTENCY_RESOURCE_DELETED" }, { status: 410 });
          return NextResponse.json({ evidence: replayEvidence, aiEligible: replayEvidence.consent, idempotentReplay: true }, { status: 200 });
        }
      }
      const raced = await db.evidence.findUnique({ where: { id: idempotentId } });
      if (raced && isEvidenceCreateReplay(raced, { projectId: id, normalized, origin })) return NextResponse.json({ evidence: raced, aiEligible: raced.consent, idempotentReplay: true }, { status: 200 });
    }
    throw error;
  }

  await logDecision(
    id,
    "ELICITATION",
    "human",
    consent ? "consent_recorded" : "added_evidence",
    `Evidence ${evidence.code} "${title.slice(0, 120)}" added (${sourceType}, ${language}${consent ? ", AI processing permission recorded" : ", excluded from AI processing"}).`
  );

  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({
    evidence,
    aiEligible: consent,
  }, { status: 201 });
}


// Update the current evidence projection while preserving every prior revision.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid evidence update payload" }, { status: 400 });
  }
  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, stageStatus: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) {
    return NextResponse.json({ error: "Evidence cannot change while the current stage is processing." }, { status: 409 });
  }
  if (typeof body.evidenceId !== "string" || !body.evidenceId) {
    return NextResponse.json({ error: "evidenceId is required" }, { status: 400 });
  }
  if (!Number.isInteger(body.expectedRevisionVersion) || body.expectedRevisionVersion < 0) {
    return NextResponse.json({ error: "expectedRevisionVersion must be a non-negative integer" }, { status: 400 });
  }
  if (body.consent !== undefined && typeof body.consent !== "boolean") {
    return NextResponse.json({ error: "consent must be a boolean" }, { status: 400 });
  }
  const existing = await db.evidence.findFirst({ where: { id: body.evidenceId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

  const normalized = {
    title: typeof body.title === "string" ? body.title.trim() : existing.title,
    content: typeof body.content === "string" ? body.content.trim() : existing.content,
    sourceType: typeof body.sourceType === "string" && SOURCE_TYPES.includes(body.sourceType) ? body.sourceType : existing.sourceType,
    language: typeof body.language === "string" && ["en", "ar-EG", "codeswitch"].includes(body.language) ? body.language : existing.language,
    consent: body.consent === undefined ? existing.consent : body.consent,
  };
  if (!normalized.title || !normalized.content || normalized.title.length > 200 || normalized.content.length > 8000) {
    return NextResponse.json({ error: "Title/content are required; limits are 200 and 8,000 characters." }, { status: 400 });
  }
  const changeNote = typeof body.changeNote === "string" ? body.changeNote.trim().slice(0, 500) : "";
  const contentHash = hashEvidenceRevision(normalized);
  const requestedOperationId = typeof body.clientOperationId === "string" ? body.clientOperationId : null;
  if (requestedOperationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOperationId)) {
    return NextResponse.json({ error: "clientOperationId must be a UUID" }, { status: 400 });
  }
  const requestHash = requestedOperationId
    ? hashEvidenceOperationRequest({ projectId: id, action: "update", origin: null, normalized: { evidenceId: existing.id, expectedRevisionVersion: body.expectedRevisionVersion, normalized, changeNote } })
    : null;
  if (requestedOperationId) {
    const prior = await db.evidenceOperation.findUnique({ where: { operationId: requestedOperationId } });
    if (prior) {
      if (prior.projectId !== id || prior.action !== "update" || prior.requestHash !== requestHash) return NextResponse.json({ error: "Idempotency key was already used for a different operation", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
      if (prior.status !== "completed" || !prior.responseJson) return NextResponse.json({ error: "This operation is still being finalized. Retry with the same idempotency key.", code: "IDEMPOTENCY_IN_PROGRESS" }, { status: 409 });
      const saved = JSON.parse(prior.responseJson);
      const replayEvidence = await db.evidence.findFirst({ where: { id: existing.id, projectId: id } });
      if (!replayEvidence) return NextResponse.json({ error: "The update completed, but its evidence was subsequently deleted.", code: "IDEMPOTENCY_RESOURCE_DELETED" }, { status: 410 });
      return NextResponse.json({ conflict: false, evidence: replayEvidence, revision: saved.revision, idempotentReplay: true }, { status: 200 });
    }
  }

  let result;
  try {
    result = await db.$transaction(async (tx) => {
    const latest = await tx.evidenceRevision.findFirst({
      where: { evidenceId: existing.id },
      orderBy: { version: "desc" },
      select: { version: true, contentHash: true },
    });
    const actualVersion = latest?.version ?? 0;
    if (actualVersion !== body.expectedRevisionVersion) {
      return { conflict: true as const, currentRevisionVersion: actualVersion };
    }
    // Compare-and-swap the current projection before writing revision history.
    // PATCH and DELETE both condition on the complete prior snapshot, so only
    // one concurrent mutation can claim this version on SQLite or PostgreSQL.
    const claimed = await tx.evidence.updateMany({
      where: buildEvidenceSnapshotWhere(existing),
      data: normalized,
    });
    if (claimed.count !== 1) {
      const current = await tx.evidenceRevision.findFirst({
        where: { evidenceId: existing.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      return { conflict: true as const, currentRevisionVersion: current?.version ?? 0 };
    }

    // Legacy rows predate revision history. Preserve their pre-edit state as v1
    // before writing a changed snapshot, otherwise the first edit would erase history.
    let previousHash = latest?.contentHash ?? null;
    if (!latest) {
      const baseline = {
        title: existing.title,
        content: existing.content,
        sourceType: existing.sourceType,
        language: existing.language,
        consent: existing.consent,
      };
      previousHash = hashEvidenceRevision(baseline);
      await tx.evidenceRevision.create({
        data: {
          evidenceId: existing.id,
          version: 1,
          ...baseline,
          contentHash: previousHash,
          changeNote: "Baseline snapshot captured during first edit (legacy source)",
          createdBy: "system",
        },
      });
    }
    const currentVersion = latest?.version ?? 1;
    const changed = previousHash !== contentHash;
    const revision = changed ? currentVersion + 1 : currentVersion;
    const updated = await tx.evidence.findUniqueOrThrow({ where: { id: existing.id } });
    if (changed) {
      await tx.evidenceRevision.create({
        data: {
          evidenceId: existing.id,
          version: revision,
          ...normalized,
          contentHash,
          changeNote: changeNote || "Evidence updated",
          createdBy: "human",
        },
      });
    }
    const operationResult = { conflict: false as const, evidence: updated, revision };
    if (requestedOperationId) {
      await tx.evidenceOperation.create({ data: { operationId: requestedOperationId, projectId: id, action: "update", requestHash: requestHash!, status: "completed", responseJson: JSON.stringify({ evidenceId: updated.id, revision }), completedAt: new Date() } });
    }
    return operationResult;
    });
  } catch (error) {
    if (requestedOperationId && typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const raced = await db.evidenceOperation.findUnique({ where: { operationId: requestedOperationId } });
      if (raced?.projectId === id && raced.action === "update" && raced.requestHash === requestHash && raced.status === "completed" && raced.responseJson) {
        const saved = JSON.parse(raced.responseJson);
        const replayEvidence = await db.evidence.findFirst({ where: { id: existing.id, projectId: id } });
        if (!replayEvidence) return NextResponse.json({ error: "The update completed, but its evidence was subsequently deleted.", code: "IDEMPOTENCY_RESOURCE_DELETED" }, { status: 410 });
        return NextResponse.json({ conflict: false, evidence: replayEvidence, revision: saved.revision, idempotentReplay: true }, { status: 200 });
      }
      if (raced) return NextResponse.json({ error: "Idempotency key was already used for a different operation", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
    }
    // Concurrent writers can both read the same latest version under the
    // database default isolation. The unique (evidenceId, version) constraint
    // is the final arbiter; translate its loser into a recoverable 409.
    if (isEvidenceRevisionVersionConflict(error)) {
      const latest = await db.evidenceRevision.findFirst({
        where: { evidenceId: existing.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      return NextResponse.json({
        error: "This evidence changed in another session. Your edits were not applied; review the latest version before saving again.",
        code: "EVIDENCE_REVISION_CONFLICT",
        currentRevisionVersion: latest?.version ?? 0,
      }, { status: 409 });
    }
    throw error;
  }

  if (result.conflict) {
    return NextResponse.json({
      error: "This evidence changed in another session. Your edits were not applied; review the latest version before saving again.",
      code: "EVIDENCE_REVISION_CONFLICT",
      currentRevisionVersion: result.currentRevisionVersion,
    }, { status: 409 });
  }

  await logDecision(id, "ELICITATION", "human", "updated_evidence",
    `Evidence ${existing.code} updated; current revision ${result.revision}. ${changeNote}`);
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json(result);
}

// Delete a source without renumbering any surviving source. Any requirement
// that cited this source is invalidated and must be reviewed again.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { id: true, stageStatus: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) {
    return NextResponse.json({ error: "Evidence cannot change while the current stage is processing. Retry after it completes." }, { status: 409 });
  }
  const searchParams = new URL(req.url).searchParams;
  const evidenceId = searchParams.get("evidenceId");
  const expectedRevisionVersionRaw = searchParams.get("expectedRevisionVersion");
  if (!evidenceId) {
    return NextResponse.json({ error: "evidenceId is required" }, { status: 400 });
  }
  const expectedRevisionVersion = parseExpectedRevisionVersion(expectedRevisionVersionRaw);
  if (expectedRevisionVersion === null) {
    return NextResponse.json({ error: "expectedRevisionVersion must be a safe non-negative integer" }, { status: 400 });
  }

  const requestedOperationId = searchParams.get("clientOperationId");
  if (requestedOperationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOperationId)) {
    return NextResponse.json({ error: "clientOperationId must be a UUID" }, { status: 400 });
  }
  const requestHash = requestedOperationId
    ? hashEvidenceOperationRequest({ projectId: id, action: "delete", origin: null, normalized: { evidenceId, expectedRevisionVersion } })
    : null;
  if (requestedOperationId) {
    const prior = await db.evidenceOperation.findUnique({ where: { operationId: requestedOperationId } });
    if (prior) {
      if (prior.projectId !== id || prior.action !== "delete" || prior.requestHash !== requestHash) return NextResponse.json({ error: "Idempotency key was already used for a different operation", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
      if (prior.status !== "completed" || !prior.responseJson) return NextResponse.json({ error: "This operation is still being finalized. Retry with the same idempotency key.", code: "IDEMPOTENCY_IN_PROGRESS" }, { status: 409 });
      return NextResponse.json(JSON.parse(prior.responseJson), { status: 200 });
    }
  }

  const removed = await db.$transaction(async (tx) => {
    const evidence = await tx.evidence.findFirst({
      where: { id: evidenceId, projectId: id },
    });
    if (!evidence) return { kind: "missing" as const };
    const latestRevision = await tx.evidenceRevision.findFirst({
      where: { evidenceId: evidence.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const currentRevisionVersion = latestRevision?.version ?? 0;
    if (currentRevisionVersion !== expectedRevisionVersion) {
      return { kind: "conflict" as const, currentRevisionVersion };
    }

    // Capture dependencies, then atomically claim deletion against the exact
    // source snapshot. A concurrent PATCH changes this predicate and wins with
    // a 409 instead of allowing a stale delete to erase the newer revision.
    const links = await tx.traceLink.findMany({
      where: {
        projectId: id,
        OR: [{ evidenceId: evidence.id }, { evidenceCode: evidence.code }],
      },
      select: { requirementId: true },
    });
    const affectedRequirementIds = [...new Set(links.map((link) => link.requirementId))];
    const claimed = await tx.evidence.deleteMany({
      where: buildEvidenceSnapshotWhere(evidence),
    });
    if (claimed.count !== 1) {
      const current = await tx.evidenceRevision.findFirst({
        where: { evidenceId: evidence.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      return { kind: "conflict" as const, currentRevisionVersion: current?.version ?? 0 };
    }

    await tx.traceLink.deleteMany({
      where: {
        projectId: id,
        OR: [{ evidenceId: evidence.id }, { evidenceCode: evidence.code }],
      },
    });

    if (affectedRequirementIds.length) {
      await tx.requirement.updateMany({
        where: { projectId: id, id: { in: affectedRequirementIds } },
        data: {
          verifyStatus: "unverified",
          verificationSource: "unverified",
          verifiedAt: null,
          verifiedBy: null,
          verifyNote: `Evidence ${evidence.code} was removed. Verify the remaining sources and re-approve this requirement.`,
          status: "revised",
        },
      });
    }

    const outcome = {
      kind: "removed" as const,
      code: evidence.code,
      title: evidence.title,
      affectedRequirements: affectedRequirementIds.length,
    };
    if (requestedOperationId) {
      await tx.evidenceOperation.create({ data: { operationId: requestedOperationId, projectId: id, action: "delete", requestHash: requestHash!, status: "completed", responseJson: JSON.stringify({ ok: true, removed: outcome }), completedAt: new Date() } });
    }
    return outcome;
  });

  if (removed.kind === "missing") {
    return NextResponse.json({ error: "Evidence not found" }, { status: 404 });
  }
  if (removed.kind === "conflict") {
    return NextResponse.json({
      error: "This evidence changed in another session. It was not deleted; refresh the source and review its latest revision.",
      code: "EVIDENCE_REVISION_CONFLICT",
      currentRevisionVersion: removed.currentRevisionVersion,
    }, { status: 409 });
  }

  if (removed.kind === "removed") {
    await logDecision(
      id,
      "ELICITATION",
      "human",
      "removed_evidence",
      `Evidence ${removed.code} "${removed.title.slice(0, 120)}" removed; ${removed.affectedRequirements} linked requirement(s) returned to unverified review.`
    );
  }

  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  const response = { ok: true, removed: removed.kind === "removed" ? removed : null };
  return NextResponse.json(response);
}
