import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { CLAIM_RELATIONSHIPS, CLAIM_STATUSES, normalizeClaimInput } from "@/lib/evidence/claims.mjs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const claims = await db.evidenceClaim.findMany({
    where: { projectId: id },
    orderBy: [{ createdAt: "desc" }],
    include: {
      evidence: { select: { id: true, code: true, title: true } },
      revision: { select: { id: true, version: true, contentHash: true } },
      requirementLinks: { include: { requirement: { select: { id: true, refId: true, text: true } } } },
    },
  });
  return NextResponse.json({ claims });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid claim payload" }, { status: 400 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) return NextResponse.json({ error: "Claims cannot change while the project pipeline is processing." }, { status: 409 });
  if (typeof body.evidenceId !== "string" || typeof body.revisionId !== "string") return NextResponse.json({ error: "evidenceId and revisionId are required." }, { status: 400 });

  const revision = await db.evidenceRevision.findFirst({
    where: { id: body.revisionId, evidenceId: body.evidenceId, evidence: { projectId: id } },
    include: { evidence: { select: { id: true, code: true, title: true } } },
  });
  if (!revision) return NextResponse.json({ error: "Evidence revision not found in this project." }, { status: 404 });

  let normalized;
  try { normalized = normalizeClaimInput(body, revision.content); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }

  const claimRef = `CL-${randomUUID().slice(0, 8).toUpperCase()}`;
  try {
    const claim = await db.evidenceClaim.create({
      data: {
        projectId: id, evidenceId: revision.evidenceId, revisionId: revision.id,
        claimRef, sourceRevisionVersion: revision.version, ...normalized,
        status: "proposed",
      },
      include: {
        evidence: { select: { id: true, code: true, title: true } },
        revision: { select: { id: true, version: true, contentHash: true } },
      },
    });
    await logDecision(id, "ELICITATION", "human", "created_evidence_claim",
      `Claim ${claimRef} captured from ${revision.evidence.code} v${revision.version}; awaiting independent review.`);
    return NextResponse.json({ claim }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "This claim already exists or could not be saved. Refresh and retry." }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid claim review payload" }, { status: 400 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) return NextResponse.json({ error: "Claims cannot change while the project pipeline is processing." }, { status: 409 });
  if (typeof body.claimId !== "string" || !CLAIM_STATUSES.includes(body.status)) return NextResponse.json({ error: "claimId and a valid review status are required." }, { status: 400 });
  const claim = await db.evidenceClaim.findFirst({ where: { id: body.claimId, projectId: id } });
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const relationship = body.relationship === undefined ? "supports" : body.relationship;
  if (body.requirementId && !CLAIM_RELATIONSHIPS.includes(relationship)) return NextResponse.json({ error: "Unsupported claim relationship." }, { status: 400 });
  if (body.requirementId && body.status !== "accepted") return NextResponse.json({ error: "Only accepted claims can be linked to a requirement." }, { status: 422 });
  const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 500) : "";
  try {
    const updated = await db.$transaction(async (tx) => {
      if (body.requirementId) {
        const requirement = await tx.requirement.findFirst({ where: { id: body.requirementId, projectId: id }, select: { id: true } });
        if (!requirement) throw new Error("REQUIREMENT_NOT_FOUND");
      }
      const saved = await tx.evidenceClaim.update({
        where: { id: claim.id },
        data: { status: body.status, reviewedBy: "owner", reviewedAt: new Date(), reviewNote },
      });
      if (body.status !== "accepted") {
        // A claim that is no longer accepted must not remain in the requirement graph.
        await tx.requirementClaim.deleteMany({ where: { claimId: claim.id, projectId: id } });
      }
      if (body.requirementId) {
        await tx.requirementClaim.upsert({
          where: { requirementId_claimId: { requirementId: body.requirementId, claimId: claim.id } },
          create: { projectId: id, requirementId: body.requirementId, claimId: claim.id, relationship, note: reviewNote },
          update: { relationship, note: reviewNote },
        });
      }
      return saved;
    });
    await logDecision(id, "EXTRACTION", "human", "reviewed_evidence_claim",
      `Claim ${claim.claimRef} marked ${body.status}${body.requirementId ? ` and linked to requirement ${body.requirementId} (${relationship})` : ""}.`);
    return NextResponse.json({ claim: updated });
  } catch (error) {
    if ((error as Error).message === "REQUIREMENT_NOT_FOUND") return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
    return NextResponse.json({ error: "Claim review could not be saved." }, { status: 409 });
  }
}
