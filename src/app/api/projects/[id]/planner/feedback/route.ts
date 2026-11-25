import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import {
  createPlannerHumanReviewPacket,
  validatePlannerHumanRatings,
  analyzePlannerHumanRatings,
} from "@/lib/research/planner-human-feedback.mjs";

type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };

function packetDigest(packet: unknown) { return createHash("sha256").update(JSON.stringify(packet)).digest("hex"); }
function parseContent(value: string) {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
  catch { return {}; }
}
function permissionContext(role: string) {
  return { role, status: "active", userStatus: "active", organizationStatus: "active" };
}
async function resolveCaller(request: NextRequest, projectId: string, permission: "requirements:review" | "requirements:approve") {
  const identity = await resolveIdentitySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return { response: NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore }) };
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: identity.organizationId, status: { not: "archived" } },
    select: { id: true, organizationId: true, brief: true },
  });
  if (!project) return { response: NextResponse.json({ error: "Project not found" }, { status: 404, headers: noStore }) };
  if (!hasOrganizationPermission(permissionContext(identity.role), permission)) {
    return { response: NextResponse.json({ error: "Insufficient organization permission" }, { status: 403, headers: noStore }) };
  }
  return { identity, project };
}
function readPacketDocument(content: string): { packet: Record<string, unknown> | null; packetId: string; experimentId: string } {
  const parsed = parseContent(content);
  const rawPacket = parsed.packet;
  if (!rawPacket || typeof rawPacket !== "object" || Array.isArray(rawPacket)) {
    return { packet: null, packetId: "", experimentId: "" };
  }
  const packet = rawPacket as Record<string, unknown>;
  return {
    packet,
    packetId: typeof packet.packetId === "string" ? packet.packetId : "",
    experimentId: typeof packet.experimentId === "string" ? packet.experimentId : "",
  };
}
function findByPacketId(rows: Array<{ id: string; content: string }>, packetId: string) {
  return rows.find((row) => readPacketDocument(row.content).packetId === packetId);
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const access = await resolveCaller(request, projectId, "requirements:review");
  if ("response" in access) return access.response;
  const runs = await db.plannerRun.findMany({
    where: { projectId, experimentId: { not: null } },
    orderBy: { createdAt: "desc" }, take: 48,
    select: { experimentId: true, arm: true },
  });
  const experiments = new Map<string, Set<string>>();
  for (const run of runs) {
    if (!run.experimentId) continue;
    if (!experiments.has(run.experimentId)) experiments.set(run.experimentId, new Set());
    experiments.get(run.experimentId)!.add(run.arm);
  }
  const experimentId = [...experiments.entries()].find(([, arms]) =>
    ["single_shot", "random", "llm", "impact_aware"].every((arm) => arms.has(arm))
  )?.[0] ?? null;
  return NextResponse.json({ experimentId, ready: Boolean(experimentId) }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!["create_packet", "submit_rating", "results"].includes(action)) {
    return NextResponse.json({ error: "action must be create_packet, submit_rating or results" }, { status: 400, headers: noStore });
  }
  const caller = await resolveCaller(request, projectId, action === "results" ? "requirements:approve" : "requirements:review");
  if ("response" in caller) return caller.response;
  const { identity, project } = caller;

  if (action === "create_packet") {
    const experimentId = typeof body?.experimentId === "string" ? body.experimentId.trim() : "";
    if (!experimentId || experimentId.length > 128) return NextResponse.json({ error: "A valid experimentId is required" }, { status: 400, headers: noStore });
    const artifacts = await db.artifact.findMany({
      where: { projectId, stage: "PLANNER", kind: "planner_human_eval_packet" },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, content: true },
    });
    const existing = artifacts.find((row) => readPacketDocument(row.content).experimentId === experimentId);
    if (existing) return NextResponse.json({ packet: readPacketDocument(existing.content).packet, existing: true }, { headers: noStore });

    const runs = await db.plannerRun.findMany({
      where: { projectId, experimentId }, orderBy: { createdAt: "asc" },
      select: { experimentId: true, arm: true, questions: true },
    });
    if (runs.length !== 4) return NextResponse.json({ error: "A complete four-arm experiment is required before human review." }, { status: 409, headers: noStore });
    const evidence = await db.evidence.findMany({
      where: { projectId, consent: true }, orderBy: { createdAt: "asc" }, take: 8,
      select: { title: true, language: true, content: true, consent: true },
    });
    const packetId = randomUUID();
    const created = createPlannerHumanReviewPacket(runs, {
      packetId, seed: randomUUID(), brief: project.brief, evidence,
    });
    const packetContent = JSON.stringify({
      packet: created.packet, packetSha256: created.packetSha256,
      createdAt: new Date().toISOString(), createdBy: identity.userId,
    });
    const keyContent = JSON.stringify({
      packetId, answerKey: created.answerKey,
      packetSha256: created.packetSha256,
    });
    const saved = await db.$transaction(async (tx) => {
      const prior = await tx.artifact.findMany({
        where: { projectId, stage: "PLANNER", kind: "planner_human_eval_packet" },
        select: { id: true, content: true },
      });
      const raced = prior.find((row) => readPacketDocument(row.content).experimentId === experimentId);
      if (raced) return { packet: readPacketDocument(raced.content).packet, existing: true };
      await tx.artifact.create({ data: { projectId, stage: "PLANNER", kind: "planner_human_eval_packet", content: packetContent } });
      await tx.artifact.create({ data: { projectId, stage: "PLANNER", kind: "planner_human_eval_key", content: keyContent } });
      return { packet: created.packet, existing: false };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(saved, { status: saved.existing ? 200 : 201, headers: noStore });
  }

  const packetId = typeof body?.packetId === "string" ? body.packetId.trim() : "";
  if (!packetId || packetId.length > 128) return NextResponse.json({ error: "A valid packetId is required" }, { status: 400, headers: noStore });
  const packetRows = await db.artifact.findMany({
    where: { projectId, stage: "PLANNER", kind: "planner_human_eval_packet" },
    orderBy: { createdAt: "desc" }, take: 100, select: { id: true, content: true },
  });
  const packetRow = findByPacketId(packetRows, packetId);
  if (!packetRow) return NextResponse.json({ error: "Planner review packet not found" }, { status: 404, headers: noStore });
  const packetDocument = parseContent(packetRow.content);
  const packet = packetDocument.packet as Parameters<typeof validatePlannerHumanRatings>[0];
  if (!packet || typeof packetDocument.packetSha256 !== "string" || packetDigest(packet) !== packetDocument.packetSha256) {
    return NextResponse.json({ error: "Planner review packet integrity verification failed." }, { status: 409, headers: noStore });
  }

  if (action === "submit_rating") {
    let ratings;
    try { ratings = validatePlannerHumanRatings(packet, body?.ratings); }
    catch (error) { return NextResponse.json({ error: String(error instanceof Error ? error.message : error).slice(0, 300) }, { status: 400, headers: noStore }); }
    const outcome = await db.$transaction(async (tx) => {
      const prior = await tx.artifact.findMany({
        where: { projectId, stage: "PLANNER", kind: "planner_human_eval_review" },
        select: { content: true },
      });
      const submitted = prior.map((row) => parseContent(row.content)).filter((row) => row.packetId === packetId);
      if (submitted.some((row) => row.reviewerId === identity.userId)) return { kind: "duplicate" as const, count: submitted.length };
      if (submitted.length >= 2) return { kind: "complete" as const, count: submitted.length };
      await tx.artifact.create({ data: {
        projectId, stage: "PLANNER", kind: "planner_human_eval_review",
        content: JSON.stringify({ packetId, reviewerId: identity.userId, ratings, submittedAt: new Date().toISOString() }),
      } });
      return { kind: "saved" as const, count: submitted.length + 1 };
    }, { isolationLevel: "Serializable" });
    if (outcome.kind === "duplicate") return NextResponse.json({ error: "This account has already submitted a review for this packet." }, { status: 409, headers: noStore });
    if (outcome.kind === "complete") return NextResponse.json({ error: "Two independent reviews are already recorded." }, { status: 409, headers: noStore });
    return NextResponse.json({ ok: true, receivedReviews: outcome.count, status: outcome.count === 2 ? "ready_for_approval_analysis" : "awaiting_second_reviewer" }, { headers: noStore });
  }

  const [keyRows, reviewRows] = await Promise.all([
    db.artifact.findMany({ where: { projectId, stage: "PLANNER", kind: "planner_human_eval_key" }, select: { content: true } }),
    db.artifact.findMany({ where: { projectId, stage: "PLANNER", kind: "planner_human_eval_review" }, orderBy: { createdAt: "asc" }, select: { content: true } }),
  ]);
  const key = keyRows.map((row) => parseContent(row.content)).find((row) => row.packetId === packetId && row.packetSha256 === packetDocument.packetSha256);
  const reviews = reviewRows.map((row) => parseContent(row.content)).filter((row) => row.packetId === packetId);
  if (!key || reviews.length < 2) return NextResponse.json({ error: "Two independent reviews are required before results can be unblinded." }, { status: 409, headers: noStore });
  try {
    const report = analyzePlannerHumanRatings(packet, key.answerKey, reviews.slice(0, 2));
    return NextResponse.json({ report }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error).slice(0, 300) }, { status: 409, headers: noStore });
  }
}
