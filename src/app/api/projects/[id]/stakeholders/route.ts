import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { isAuthConfigured, SESSION_COOKIE, verifyAdminRequest } from "@/lib/security/session.mjs";
import {
  normalizeStakeholder, normalizeStakeholderPosition, normalizePositionEvidence,
  normalizeNegotiation, normalizeNegotiationDecision, NEGOTIATION_ROLES,
  POSITION_STATUSES, normalizeStakeholderUpdate, normalizeNegotiationResponse, assertNegotiationQuorum, assertNegotiationDecisionAuthority,
} from "@/lib/stakeholders/collaboration.mjs";

type Params = { params: Promise<{ id: string }> };
const locked = (status: string) => ["agent_running","approving"].includes(status);
const bad = (error: unknown) => NextResponse.json({ error: error instanceof Error ? error.message : "Invalid payload." }, { status: 400 });
const objectBody = (body: unknown): body is Record<string, any> => Boolean(body && typeof body === "object" && !Array.isArray(body));

function requireOwner(req: NextRequest) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const session = verifyAdminRequest(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "A valid owner session is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}


export async function GET(req: NextRequest, { params }: Params) {
  const authError = requireOwner(req);
  if (authError) return authError;
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const [stakeholders, positions, negotiations, acceptedClaims] = await Promise.all([
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
    db.evidenceClaim.findMany({ where: { projectId: id, status: "accepted" }, orderBy: { createdAt: "desc" },
      select: { id: true, claimRef: true, claimText: true, quote: true, evidence: { select: { code: true, title: true } } } }),
  ]);
  return NextResponse.json({
    stakeholders: stakeholders.map(x => ({ ...x, goals: safeArray(x.goals), concerns: safeArray(x.concerns) })),
    positions,
    negotiations: negotiations.map(x => ({ ...x, options: safeArray(x.options), dissent: safeArray(x.dissent) })),
    acceptedClaims,
  });
}

function safeArray(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }

export async function POST(req: NextRequest, { params }: Params) {
  const authError = requireOwner(req);
  if (authError) return authError;
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
      try {
        const saved = await db.stakeholderPositionEvidence.create({ data: { projectId: id, positionId, ...link } });
        await logDecision(id, "CLEARANCE", "human", "linked_position_evidence", `Accepted claim ${claim.id} linked to stakeholder position ${positionId}.`);
        return NextResponse.json({ evidenceLink: saved }, { status: 201 });
      } catch {
        return NextResponse.json({ error: "This evidence claim is already linked to the position." }, { status: 409 });
      }
    }
    if (body.action === "create_negotiation") {
      const data = normalizeNegotiation(body);
      const requirement = await db.requirement.findFirst({ where: { id: data.requirementId, projectId: id }, select: { id: true, refId: true } });
      if (!requirement) return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
      const participants = body.participants ?? [];
      assertNegotiationQuorum(participants);
      const normalizedParticipants = participants.map((p: any) => {
        if (!p || typeof p.stakeholderId !== "string" || !p.stakeholderId.trim() || !NEGOTIATION_ROLES.includes(p.role ?? "consulted")) throw new Error("Invalid negotiation participant.");
        if (p.note !== undefined && (typeof p.note !== "string" || p.note.length > 500)) throw new Error("Participant note must be text up to 500 characters.");
        return { stakeholderId: p.stakeholderId.trim(), role: p.role ?? "consulted", note: (p.note ?? "").trim() };
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
  const authError = requireOwner(req);
  if (authError) return authError;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!objectBody(body)) return bad(new Error("Payload must be an object."));
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (locked(project.stageStatus)) return NextResponse.json({ error: "Collaboration records are locked while the pipeline is processing." }, { status: 409 });

  if (body.action === "update_stakeholder") {
    if (typeof body.stakeholderId !== "string" || !body.stakeholderId.trim()) return NextResponse.json({ error: "stakeholderId is required." }, { status: 400 });
    const stakeholder = await db.stakeholderProfile.findFirst({ where: { id: body.stakeholderId, projectId: id } });
    if (!stakeholder) return NextResponse.json({ error: "Stakeholder not found in this project." }, { status: 404 });
    let update;
    try { update = normalizeStakeholderUpdate(body, stakeholder); } catch (error) { return bad(error); }
    const { engagementStatus, approvalRole } = update;
    if (engagementStatus === stakeholder.engagementStatus && approvalRole === stakeholder.approvalRole) {
      return NextResponse.json({ stakeholder, unchanged: true });
    }
    const transition = await db.stakeholderProfile.updateMany({
      where: { id: stakeholder.id, projectId: id, updatedAt: stakeholder.updatedAt },
      data: { engagementStatus, approvalRole },
    });
    if (transition.count !== 1) return NextResponse.json({ error: "Stakeholder profile changed concurrently. Refresh before retrying." }, { status: 409 });
    const updated = await db.stakeholderProfile.findFirst({ where: { id: stakeholder.id, projectId: id } });
    if (!updated) return NextResponse.json({ error: "Stakeholder profile could not be reloaded." }, { status: 500 });
    await logDecision(id, "CLEARANCE", "human", "updated_stakeholder_governance", `${updated.stakeholderRef}: role ${stakeholder.approvalRole} → ${updated.approvalRole}; engagement ${stakeholder.engagementStatus} → ${updated.engagementStatus}.`);
    return NextResponse.json({ stakeholder: updated });
  }
  if (body.action === "respond_negotiation") {
    if (typeof body.negotiationId !== "string" || typeof body.participantId !== "string") {
      return NextResponse.json({ error: "negotiationId and participantId are required." }, { status: 400 });
    }
    let response;
    try { response = normalizeNegotiationResponse(body); } catch (error) { return bad(error); }
    const negotiation = await db.negotiationDecision.findFirst({ where: { id: body.negotiationId, projectId: id }, select: { id: true, status: true, requirement: { select: { refId: true } } } });
    if (!negotiation) return NextResponse.json({ error: "Negotiation not found in this project." }, { status: 404 });
    if (negotiation.status !== "proposed") return NextResponse.json({ error: "Participant responses are closed after a decision is recorded." }, { status: 409 });
    const participant = await db.negotiationParticipant.findFirst({ where: { id: body.participantId, decisionId: negotiation.id, projectId: id }, include: { stakeholder: { select: { stakeholderRef: true, displayName: true } } } });
    if (!participant) return NextResponse.json({ error: "Participant not found in this negotiation." }, { status: 404 });
    if (participant.responseStatus !== "pending") return NextResponse.json({ error: "This participant response is immutable once submitted." }, { status: 409 });
    const transition = await db.negotiationParticipant.updateMany({
      where: { id: participant.id, decisionId: negotiation.id, projectId: id, responseStatus: "pending" },
      data: { responseStatus: response.responseStatus, responseRationale: response.rationale, respondedAt: new Date() },
    });
    if (transition.count !== 1) return NextResponse.json({ error: "Participant response was submitted concurrently. Refresh before continuing." }, { status: 409 });
    const updated = await db.negotiationParticipant.findFirst({ where: { id: participant.id, projectId: id } });
    await logDecision(id, "CLEARANCE", "human", "recorded_stakeholder_negotiation_response",
      `${participant.stakeholder.stakeholderRef} responded ${response.responseStatus} to ${negotiation.requirement.refId}: ${response.rationale.slice(0, 300)}`);
    return NextResponse.json({ participant: updated }, { status: 201 });
  }
  if (body.action === "review_position") {
    if (typeof body.positionId !== "string" || !POSITION_STATUSES.includes(body.status) || body.status === "proposed") {
      return NextResponse.json({ error: "positionId and accepted/rejected status are required." }, { status: 400 });
    }
    const position = await db.stakeholderPosition.findFirst({ where: { id: body.positionId, projectId: id }, include: { stakeholder: true, requirement: true } });
    if (!position) return NextResponse.json({ error: "Position not found in this project." }, { status: 404 });
    if (position.stakeholder.engagementStatus === "withdrawn" && body.status === "accepted") return NextResponse.json({ error: "A withdrawn stakeholder's position cannot be accepted." }, { status: 409 });
    if (position.status !== "proposed") return NextResponse.json({ error: "A reviewed position is immutable. Capture a new position to record a changed view." }, { status: 409 });
    const transition = await db.stakeholderPosition.updateMany({ where: { id: position.id, projectId: id, status: "proposed" }, data: { status: body.status, reviewedBy: "owner", reviewedAt: new Date() } });
    if (transition.count !== 1) return NextResponse.json({ error: "This position was reviewed by another action. Refresh before continuing." }, { status: 409 });
    const updated = await db.stakeholderPosition.findUnique({ where: { id: position.id } });
    await logDecision(id, "CLEARANCE", "human", "reviewed_stakeholder_position", `${position.stakeholder.stakeholderRef} position on ${position.requirement.refId} marked ${body.status}.`);
    return NextResponse.json({ position: updated });
  }
  if (body.action === "decide_negotiation") {
    if (typeof body.negotiationId !== "string") return NextResponse.json({ error: "negotiationId is required." }, { status: 400 });
    const negotiation = await db.negotiationDecision.findFirst({ where: { id: body.negotiationId, projectId: id }, include: { requirement: true, participants: { select: { id: true, responseStatus: true, stakeholder: { select: { approvalRole: true, stakeholderRef: true } } } } } });
    if (!negotiation) return NextResponse.json({ error: "Negotiation not found in this project." }, { status: 404 });
    if (negotiation.status !== "proposed") return NextResponse.json({ error: "A recorded negotiation decision is immutable. Create a follow-up negotiation to revisit it." }, { status: 409 });
    const pendingResponses = negotiation.participants.filter(p => p.responseStatus === "pending").length;
    if (pendingResponses > 0) return NextResponse.json({ error: `All stakeholder participants must submit a response before the decision. ${pendingResponses} response(s) pending.` }, { status: 409 });
    let decision;
    try { decision = normalizeNegotiationDecision(body, negotiation.options); } catch (error) { return bad(error); }
    try { assertNegotiationDecisionAuthority(negotiation.participants, decision); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Approval authority requirement not met." }, { status: 403 }); }
    const transition = await db.negotiationDecision.updateMany({
      where: { id: negotiation.id, projectId: id, status: "proposed" },
      data: { ...decision, decidedBy: "owner", decidedAt: new Date() },
    });
    if (transition.count !== 1) return NextResponse.json({ error: "This negotiation was decided by another action. Refresh before continuing." }, { status: 409 });
    const updated = await db.negotiationDecision.findUnique({ where: { id: negotiation.id } });
    if (!updated) return NextResponse.json({ error: "Negotiation decision could not be reloaded." }, { status: 500 });
    await logDecision(id, "CLEARANCE", "human", "decided_multi_stakeholder_negotiation",
      `${negotiation.requirement.refId}: ${updated.status}; selected option ${updated.chosenOption ?? "none"}; human rationale recorded.`);
    return NextResponse.json({ negotiation: { ...updated, options: safeArray(updated.options), dissent: safeArray(updated.dissent) } });
  }
  return NextResponse.json({ error: "Unsupported collaboration action." }, { status: 400 });
}
