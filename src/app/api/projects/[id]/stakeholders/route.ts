import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import {
  normalizeStakeholder, normalizeStakeholderPosition, normalizePositionEvidence,
  normalizeNegotiation, normalizeNegotiationDecision, NEGOTIATION_ROLES,
  POSITION_STATUSES, STAKEHOLDER_ENGAGEMENT,
} from "@/lib/stakeholders/collaboration.mjs";

type Params = { params: Promise<{ id: string }> };
const locked = (status: string) => ["agent_running","approving"].includes(status);
const bad = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload." }, { status: 400 });
const objectBody = (body: unknown): body is Record<string, any> => Boolean(body && typeof body === "object" && !Array.isArray(body));

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [stakeholders, positions, negotiations] = await Promise.all([
    db.stakeholderProfile.findMany({ where: { projectId: id }, orderBy: { updatedAt: "desc" } }),
    db.stakeholderPosition.findMany({
      where: { projectId: id }, orderBy: { createdAt: "desc" },
      include: { stakeholder: { select: { id: true, stakeholderRef: true, displayName: true, approvalRole: true } },
        requirement: { select: { id: true, refId: true, text: true } },
        evidence: { include: { claim: { select: { id: true, claimRef: true, quote: true, status: true } } } } },
    }),
    db.negotiationDecision.findMany({
      where: { projectId: id }, orderBy: { updatedAt: "desc" },
      include: { requirement: { select: { id: true, refId: true, text: true } },
        participants: { include: { stakeholder: { select: { id: true, stakeholderRef: true, displayName: true } } } } },
    }),
  ]);
  return NextResponse.json({
    stakeholders: stakeholders.map(x => ({ ...x, goals: safeArray(x.goals), concerns: safeArray(x.concerns) })),
    positions,
    negotiations: negotiations.map(x => ({ ...x, options: safeArray(x.options), dissent: safeArray(x.dissent) })),
  });
}

function safeArray(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!objectBody(body)) return bad(new Error("Payload must be an object."));
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (locked(project.stageStatus)) return NextResponse.json({ error: "Collaboration records are locked while the pipeline is processing." }, { status: 409 });

  try {
    if (body.action === "create_stakeholder") {
      const data = normalizeStakeholder(body);
      const stakeholder = await db.stakeholderProfile.create({ data: { projectId: id, ...data } });
      await logDecision(id, "CLEARANCE", "human", "created_stakeholder_profile", `${stakeholder.stakeholderRef}: ${stakeholder.displayName} (${stakeholder.approvalRole}).`);
      return NextResponse.json({ stakeholder }, { status: 201 });
    }
    if (body.action === "create_position") {
      const data = normalizeStakeholderPosition(body);
      const [stakeholder, requirement] = await Promise.all([
        db.stakeholderProfile.findFirst({ where: { id: data.stakeholderId, projectId: id, engagementStatus: { not: "withdrawn" } }, select: { id: true, stakeholderRef: true } }),
        db.requirement.findFirst({ where: { id: data.requirementId, projectId: id }, select: { id: true, refId: true } }),
      ]);
      if (!stakeholder || !requirement) return NextResponse.json({ error: "Stakeholder or requirement not found in this project." }, { status: 404 });
      const position = await db.stakeholderPosition.create({ data: { projectId: id, ...data, status: "proposed" } });
      await logDecision(id, "CLEARANCE", "human", "captured_stakeholder_position", `${stakeholder.stakeholderRef} recorded ${data.position} position on ${requirement.refId}; pending review.`);
      return NextResponse.json({ position }, { status: 201 });
    }
    if (body.action === "link_position_evidence") {
      const positionId = typeof body.positionId === "string" ? body.positionId : "";
      const position = await db.stakeholderPosition.findFirst({ where: { id: positionId, projectId: id }, select: { id: true, status: true } });
      if (!position) return NextResponse.json({ error: "Position not found in this project." }, { status: 404 });
      if (position.status !== "accepted") return NextResponse.json({ error: "Only accepted stakeholder positions can be linked to evidence." }, { status: 422 });
      const link = normalizePositionEvidence(body);
      const claim = await db.evidenceClaim.findFirst({ where: { id: link.claimId, projectId: id, status: "accepted" }, select: { id: true } });
      if (!claim) return NextResponse.json({ error: "Accepted evidence claim not found in this project." }, { status: 404 });
      const saved = await db.stakeholderPositionEvidence.create({ data: { projectId: id, positionId, ...link } });
      await logDecision(id, "CLEARANCE", "human", "linked_position_evidence", `Accepted claim ${claim.id} linked to stakeholder position ${positionId}.`);
      return NextResponse.json({ evidenceLink: saved }, { status: 201 });
    }
    if (body.action === "create_negotiation") {
      const data = normalizeNegotiation(body);
      const requirement = await db.requirement.findFirst({ where: { id: data.requirementId, projectId: id }, select: { id: true, refId: true } });
      if (!requirement) return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
      const participants = body.participants ?? [];
      if (!Array.isArray(participants) || participants.length > 30) throw new Error("participants must be an array of at most 30 entries.");
      const normalizedParticipants = participants.map((p: any) => {
        if (!p || typeof p.stakeholderId !== "string" || !NEGOTIATION_ROLES.includes(p.role ?? "consulted")) throw new Error("Invalid negotiation participant.");
        return { stakeholderId: p.stakeholderId, role: p.role ?? "consulted", note: typeof p.note === "string" ? p.note.trim().slice(0,500) : "" };
      });
      if (new Set(normalizedParticipants.map((p: any) => p.stakeholderId)).size !== normalizedParticipants.length) throw new Error("A stakeholder can only participate once per negotiation.");
      const stakeholderIds = normalizedParticipants.map((p: any) => p.stakeholderId);
      const count = stakeholderIds.length ? await db.stakeholderProfile.count({ where: { id: { in: stakeholderIds }, projectId: id, engagementStatus: { not: "withdrawn" } } }) : 0;
      if (count !== stakeholderIds.length) return NextResponse.json({ error: "Every participant must be an active stakeholder in this project." }, { status: 404 });
      const negotiation = await db.negotiationDecision.create({
        data: { projectId: id, ...data, participants: { create: normalizedParticipants.map((p: any) => ({ projectId: id, ...p })) } },
        include: { participants: true },
      });
      await logDecision(id, "CLEARANCE", "human", "created_multi_stakeholder_negotiation", `${requirement.refId}: ${negotiation.title}; ${normalizedParticipants.length} participants; no option selected by the system.`);
      return NextResponse.json({ negotiation: { ...negotiation, options: JSON.parse(negotiation.options) } }, { status: 201 });
    }
    return NextResponse.json({ error: "Unsupported collaboration action." }, { status: 400 });
  } catch (error) { return bad(error); }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!objectBody(body)) return bad(new Error("Payload must be an object."));
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (locked(project.stageStatus)) return NextResponse.json({ error: "Collaboration records are locked while the pipeline is processing." }, { status: 409 });

  if (body.action === "review_position") {
    if (typeof body.positionId !== "string" || !POSITION_STATUSES.includes(body.status) || body.status === "proposed") {
      return NextResponse.json({ error: "positionId and accepted/rejected status are required." }, { status: 400 });
    }
    const position = await db.stakeholderPosition.findFirst({ where: { id: body.positionId, projectId: id }, include: { stakeholder: true, requirement: true } });
    if (!position) return NextResponse.json({ error: "Position not found in this project." }, { status: 404 });
    if (position.stakeholder.engagementStatus === "withdrawn" && body.status === "accepted") return NextResponse.json({ error: "A withdrawn stakeholder's position cannot be accepted." }, { status: 409 });
    const updated = await db.stakeholderPosition.update({ where: { id: position.id }, data: { status: body.status, reviewedBy: "owner", reviewedAt: new Date() } });
    await logDecision(id, "CLEARANCE", "human", "reviewed_stakeholder_position", `${position.stakeholder.stakeholderRef} position on ${position.requirement.refId} marked ${body.status}.`);
    return NextResponse.json({ position: updated });
  }
  if (body.action === "decide_negotiation") {
    if (typeof body.negotiationId !== "string") return NextResponse.json({ error: "negotiationId is required." }, { status: 400 });
    const negotiation = await db.negotiationDecision.findFirst({ where: { id: body.negotiationId, projectId: id }, include: { requirement: true } });
    if (!negotiation) return NextResponse.json({ error: "Negotiation not found in this project." }, { status: 404 });
    let decision;
    try { decision = normalizeNegotiationDecision(body, negotiation.options); } catch (error) { return bad(error); }
    const updated = await db.negotiationDecision.update({
      where: { id: negotiation.id },
      data: { ...decision, decidedBy: "owner", decidedAt: new Date() },
    });
    await logDecision(id, "CLEARANCE", "human", "decided_multi_stakeholder_negotiation",
      `${negotiation.requirement.refId}: ${updated.status}; selected option ${updated.chosenOption ?? "none"}; human rationale recorded.`);
    return NextResponse.json({ negotiation: { ...updated, options: safeArray(updated.options), dissent: safeArray(updated.dissent) } });
  }
  return NextResponse.json({ error: "Unsupported collaboration action." }, { status: 400 });
}
