import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import {
  validateAgentEvaluationScores,
  analyzeAgentArtifactReviews,
  analyzeAgentEvaluationCohort,
} from "@/lib/research/agent-evaluation.mjs";

type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };
const AGENT_STAGES = ["ELICITATION", "SCOPE", "EXTRACTION", "AMBIGUITY", "STORIES", "CONFLICTS", "DRIFT"];

function parseContent(content: string) {
  try { const value = JSON.parse(content); return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}
function can(identity: { role: string }, permission: "requirements:review" | "requirements:approve") {
  return hasOrganizationPermission({ role: identity.role, status: "active", userStatus: "active", organizationStatus: "active" }, permission);
}
async function caller(request: NextRequest, projectId: string, permission: "requirements:review" | "requirements:approve") {
  const identity = await resolveIdentitySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return { response: NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore }) };
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: identity.organizationId, status: { not: "archived" } },
    select: { id: true },
  });
  if (!project) return { response: NextResponse.json({ error: "Project not found" }, { status: 404, headers: noStore }) };
  if (!can(identity, permission)) return { response: NextResponse.json({ error: "Insufficient organization permission" }, { status: 403, headers: noStore }) };
  return { identity };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const access = await caller(request, projectId, "requirements:review");
  if ("response" in access) return access.response;
  const artifacts = await db.artifact.findMany({
    where: { projectId, stage: { in: AGENT_STAGES }, kind: "json" },
    orderBy: { createdAt: "desc" }, take: 40,
    select: { id: true, stage: true, kind: true, content: true, createdAt: true },
  });
  return NextResponse.json({
    artifacts: artifacts.map((row) => ({
      id: row.id, stage: row.stage, createdAt: row.createdAt,
      content: row.content.slice(0, 12_000),
      truncated: row.content.length > 12_000,
    })),
  }, { headers: noStore });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!["submit_review", "results"].includes(action)) return NextResponse.json({ error: "action must be submit_review or results" }, { status: 400, headers: noStore });
  const access = await caller(request, projectId, action === "results" ? "requirements:approve" : "requirements:review");
  if ("response" in access) return access.response;
  const { identity } = access;
  const artifactId = typeof body?.artifactId === "string" ? body.artifactId.trim() : "";
  if (!artifactId || artifactId.length > 128) return NextResponse.json({ error: "A valid artifactId is required" }, { status: 400, headers: noStore });
  const artifact = await db.artifact.findFirst({
    where: { id: artifactId, projectId, stage: { in: AGENT_STAGES }, kind: "json" },
    select: { id: true, stage: true },
  });
  if (!artifact) return NextResponse.json({ error: "Agent artifact not found" }, { status: 404, headers: noStore });

  if (action === "submit_review") {
    let scores;
    try { scores = validateAgentEvaluationScores(body?.scores); }
    catch (error) { return NextResponse.json({ error: String(error instanceof Error ? error.message : error).slice(0, 300) }, { status: 400, headers: noStore }); }
    const note = typeof body?.note === "string" ? body.note.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000) : "";
    const result = await db.$transaction(async (tx) => {
      const rows = await tx.artifact.findMany({
        where: { projectId, stage: "AGENT_EVALUATION", kind: "agent_human_eval_review" },
        select: { content: true },
      });
      const prior = rows.map((row) => parseContent(row.content)).filter((row) => row.artifactId === artifactId);
      if (prior.some((row) => row.reviewerId === identity.userId)) return { kind: "duplicate" as const, count: prior.length };
      if (prior.length >= 2) return { kind: "complete" as const, count: prior.length };
      await tx.artifact.create({ data: {
        projectId, stage: "AGENT_EVALUATION", kind: "agent_human_eval_review",
        content: JSON.stringify({ artifactId, stage: artifact.stage, reviewerId: identity.userId, scores, note, submittedAt: new Date().toISOString() }),
      } });
      return { kind: "saved" as const, count: prior.length + 1 };
    }, { isolationLevel: "Serializable" });
    if (result.kind === "duplicate") return NextResponse.json({ error: "This account already reviewed this artifact." }, { status: 409, headers: noStore });
    if (result.kind === "complete") return NextResponse.json({ error: "Two independent reviews are already recorded." }, { status: 409, headers: noStore });
    return NextResponse.json({ ok: true, receivedReviews: result.count, status: result.count === 2 ? "ready_for_approval_analysis" : "awaiting_second_reviewer" }, { headers: noStore });
  }

  const rows = await db.artifact.findMany({
    where: { projectId, stage: "AGENT_EVALUATION", kind: "agent_human_eval_review" },
    orderBy: { createdAt: "asc" }, select: { content: true },
  });
  const reviews = rows.map((row) => parseContent(row.content)).filter((row) => row.artifactId === artifactId);
  if (reviews.length < 2) return NextResponse.json({ error: "Two independent human reviews are required before analysis." }, { status: 409, headers: noStore });
  const report = analyzeAgentArtifactReviews(reviews.slice(0, 2).map((row) => ({ scores: row.scores })));

  const [allArtifacts, allReviewRows] = await Promise.all([
    db.artifact.findMany({ where: { projectId, stage: { in: AGENT_STAGES }, kind: "json" }, select: { id: true, stage: true } }),
    db.artifact.findMany({ where: { projectId, stage: "AGENT_EVALUATION", kind: "agent_human_eval_review" }, select: { content: true } }),
  ]);
  const stages = new Map(allArtifacts.map((row) => [row.id, row.stage]));
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of allReviewRows) {
    const review = parseContent(row.content);
    if (typeof review.artifactId !== "string" || !stages.has(review.artifactId)) continue;
    if (!grouped.has(review.artifactId)) grouped.set(review.artifactId, []);
    grouped.get(review.artifactId)!.push(review);
  }
  const cohort = analyzeAgentEvaluationCohort([...grouped.entries()]
    .filter(([, group]) => group.length >= 2)
    .map(([id, group]) => ({ stage: stages.get(id), reviews: group.slice(0, 2).map((row) => ({ scores: row.scores })) })));
  return NextResponse.json({ report, cohort }, { headers: noStore });
}
