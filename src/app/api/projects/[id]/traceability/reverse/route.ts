import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { traverseImpact } from "@/lib/graph";
import { resolveTrackerRequirement, summarizeReverseDecisions, summarizeReverseTrace } from "@/lib/traceability/reverse.mjs";

type Params = { params: Promise<{ id: string }> };

// Resolve a tracker change to evidence-backed requirements. Resolution is
// limited to persisted links and exact stable references; no semantic guesses.
export async function GET(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const syncMapId = request.nextUrl.searchParams.get("syncMapId");
  if (!syncMapId) return NextResponse.json({ error: "syncMapId is required." }, { status: 400 });

  const [project, syncMap, requirements, stories] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    db.syncMap.findFirst({ where: { id: syncMapId, projectId } }),
    db.requirement.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    db.userStory.findMany({ where: { projectId }, select: { id: true, requirementId: true, refId: true, title: true, status: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!syncMap) return NextResponse.json({ error: "Tracker record not found in this project." }, { status: 404 });

  const resolved = resolveTrackerRequirement(syncMap, requirements, stories);
  if (!resolved.requirement) {
    return NextResponse.json({
      ok: true, tracker: { id: syncMap.id, kind: syncMap.kind, externalKey: syncMap.externalKey, externalUrl: syncMap.externalUrl, title: syncMap.title },
      resolution: resolved.resolution,
      guidance: "Create an explicit tracker-to-requirement link after human review. Similarity is not accepted as traceability.",
      trace: summarizeReverseTrace({ requirement: null }),
    });
  }

  const requirement = resolved.requirement;
  const [traceLinks, claimLinks, knowledgeLinks, linkedStories, impact, decisionEntries] = await Promise.all([
    db.traceLink.findMany({
      where: { projectId, requirementId: requirement.id },
      orderBy: { evidenceCode: "asc" },
      include: {
        evidence: {
          select: {
            id: true, code: true, title: true, sourceType: true, language: true, consent: true, createdAt: true,
            revisions: {
              orderBy: { version: "desc" },
              take: 1,
              select: { version: true, changeNote: true, createdAt: true, createdBy: true },
            },
          },
        },
      },
    }),
    db.requirementClaim.findMany({
      where: { projectId, requirementId: requirement.id },
      include: { claim: { include: { evidence: { select: { code: true } }, revision: { select: { version: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    db.knowledgeRequirement.findMany({
      where: { projectId, requirementId: requirement.id },
      include: { node: { select: { id: true, nodeRef: true, kind: true, label: true, status: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.userStory.findMany({ where: { projectId, requirementId: requirement.id }, select: { id: true, refId: true, title: true, status: true } }),
    traverseImpact(projectId, [requirement.id]),
    db.decisionEntry.findMany({
      where: { projectId, stage: "GRAPH", action: "linked_tracker_change_to_requirement" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, action: true, actor: true, detail: true, createdAt: true },
    }),
  ]);

  // Enrich reverse impact with the affected requirement's current verification
  // state and evidence coverage. Every lookup remains project-scoped.
  const impactedIds = [...new Set(impact.impacted.map((item) => item.id).filter((item) => typeof item === "string"))];
  const [impactedRequirements, impactedEvidence] = impactedIds.length ? await Promise.all([
    db.requirement.findMany({
      where: { projectId, id: { in: impactedIds } },
      select: { id: true, refId: true, text: true, status: true, priority: true, verifyStatus: true, driftStatus: true },
    }),
    db.traceLink.findMany({
      where: { projectId, requirementId: { in: impactedIds } },
      select: { requirementId: true, evidenceCode: true },
    }),
  ]) : [[], []];
  const impactedById = new Map(impactedRequirements.map((item) => [item.id, item]));
  const evidenceByRequirement = new Map();
  for (const link of impactedEvidence) {
    const codes = evidenceByRequirement.get(link.requirementId) ?? [];
    codes.push(link.evidenceCode);
    evidenceByRequirement.set(link.requirementId, codes);
  }
  const enrichedImpact = impact.impacted.map((item) => ({
    ...item,
    requirement: impactedById.get(item.id) ?? null,
    evidenceCodes: evidenceByRequirement.get(item.id) ?? [],
  }));

  return NextResponse.json({
    ok: true,
    tracker: { id: syncMap.id, kind: syncMap.kind, externalKey: syncMap.externalKey, externalUrl: syncMap.externalUrl, title: syncMap.title, syncedAt: syncMap.syncedAt },
    resolution: resolved.resolution,
    requirement: { id: requirement.id, refId: requirement.refId, text: requirement.text, status: requirement.status, priority: requirement.priority },
    trace: summarizeReverseTrace({
      requirement, traceLinks, claimLinks, knowledgeLinks, stories: linkedStories, impacted: enrichedImpact,
      decisions: summarizeReverseDecisions(decisionEntries, requirement.id, syncMap.id),
    }),
  });
}

// Human-reviewed mapping: tracker events never attach themselves to a
// requirement based on text similarity or changed file paths.
export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || body.action !== "link_tracker_requirement") {
    return NextResponse.json({ error: "Unsupported traceability action." }, { status: 400 });
  }
  if (typeof body.syncMapId !== "string" || typeof body.requirementId !== "string") {
    return NextResponse.json({ error: "syncMapId and requirementId are required." }, { status: 400 });
  }
  const [project, syncMap, requirement] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true, stageStatus: true } }),
    db.syncMap.findFirst({ where: { id: body.syncMapId, projectId }, select: { id: true, kind: true, externalKey: true, localLabel: true } }),
    db.requirement.findFirst({ where: { id: body.requirementId, projectId }, select: { id: true, refId: true, text: true } }),
  ]);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!syncMap) return NextResponse.json({ error: "Tracker record not found in this project." }, { status: 404 });
  if (!requirement) return NextResponse.json({ error: "Requirement not found in this project." }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) {
    return NextResponse.json({ error: "Traceability links are locked while the pipeline is processing." }, { status: 409 });
  }
  const updated = await db.$transaction(async (tx) => {
    const mapping = await tx.syncMap.update({
      where: { id: syncMap.id },
      data: { requirementId: requirement.id, localLabel: requirement.refId },
      select: { id: true, kind: true, externalKey: true, localLabel: true, requirementId: true },
    });
    await tx.decisionEntry.create({
      data: {
        projectId, stage: "GRAPH", actor: "human", action: "linked_tracker_change_to_requirement",
        detail: JSON.stringify({
          syncMapId: syncMap.id, trackerKind: syncMap.kind, externalKey: syncMap.externalKey,
          requirementId: requirement.id, requirementRef: requirement.refId, mappingMethod: "human_review",
        }),
      },
    });
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return mapping;
  });
  return NextResponse.json({ ok: true, mapping: updated });
}
