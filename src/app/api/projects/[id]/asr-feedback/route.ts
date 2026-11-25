import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { prepareAsrHumanCorrection } from "@/lib/asr/asr-human-correction.mjs";

type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(request: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid ASR feedback request." }, { status: 400, headers: noStore });
  }
  if (Object.hasOwn(body, "audio") || Object.hasOwn(body, "audioBase64")) {
    return NextResponse.json({ error: "Audio files are never accepted or stored by ASR correction feedback." }, { status: 400, headers: noStore });
  }
  let correction;
  try { correction = prepareAsrHumanCorrection(body); }
  catch (error) {
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error).slice(0, 300) }, { status: 400, headers: noStore });
  }

  const identity = await resolveIdentitySession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (!identity) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: noStore });
  if (!hasOrganizationPermission({
    role: identity.role, status: "active", userStatus: "active", organizationStatus: "active",
  }, "requirements:write")) {
    return NextResponse.json({ error: "Insufficient organization permission" }, { status: 403, headers: noStore });
  }
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: identity.organizationId, status: { not: "archived" } },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404, headers: noStore });

  const saved = await db.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({
      data: {
        projectId,
        stage: "ASR_RESEARCH",
        kind: "asr_human_correction",
        content: JSON.stringify({
          schemaVersion: 1,
          language: correction.language,
          originalTranscript: correction.originalTranscript,
          correctedTranscript: correction.correctedTranscript,
          redactions: correction.redactions,
          consentVersion: correction.consentVersion,
          consentedAt: new Date().toISOString(),
          consentedBy: identity.userId,
          audioStored: false,
        }),
      },
      select: { id: true },
    });
    await tx.decisionEntry.create({
      data: {
        projectId, stage: "ASR_RESEARCH", actor: "human", action: "asr_text_correction_consent",
        detail: JSON.stringify({
          artifactId: artifact.id, language: correction.language, audioStored: false,
          redactions: correction.redactions,
        }),
      },
    });
    return artifact;
  }, { isolationLevel: "Serializable" });

  return NextResponse.json({
    ok: true, saved: true, artifactId: saved.id, audioStored: false,
    redactions: correction.redactions,
  }, { status: 201, headers: noStore });
}
