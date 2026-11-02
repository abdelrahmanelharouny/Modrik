import { randomUUID } from "node:crypto";
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

  const project = await db.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

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
  const idempotentId = randomUUID();
  const evidence = await db.evidence.create({
    data: {
      id: idempotentId,
      projectId: id,
      code: `E-${idempotentId.slice(0, 8).toUpperCase()}`,
      title,
      content,
      sourceType: SOURCE_TYPES.includes(sourceType) ? sourceType : "interview",
      language: ["en", "ar-EG", "codeswitch"].includes(language) ? language : "en",
      consent,
      origin,
    },
  });

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

// Delete a source without renumbering any surviving source. Any requirement
// that cited this source is invalidated and must be reviewed again.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const evidenceId = new URL(req.url).searchParams.get("evidenceId");
  if (!evidenceId) {
    return NextResponse.json({ error: "evidenceId is required" }, { status: 400 });
  }

  const removed = await db.$transaction(async (tx) => {
    const evidence = await tx.evidence.findFirst({
      where: { id: evidenceId, projectId: id },
    });
    if (!evidence) return null;

    // evidenceId is authoritative; evidenceCode catches legacy trace links
    // created before the stable foreign-key column existed.
    const links = await tx.traceLink.findMany({
      where: {
        projectId: id,
        OR: [{ evidenceId: evidence.id }, { evidenceCode: evidence.code }],
      },
      select: { requirementId: true },
    });
    const affectedRequirementIds = [...new Set(links.map((link) => link.requirementId))];

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

    await tx.evidence.delete({ where: { id: evidence.id } });
    return {
      code: evidence.code,
      title: evidence.title,
      affectedRequirements: affectedRequirementIds.length,
    };
  });

  if (removed) {
    await logDecision(
      id,
      "ELICITATION",
      "human",
      "removed_evidence",
      `Evidence ${removed.code} "${removed.title.slice(0, 120)}" removed; ${removed.affectedRequirements} linked requirement(s) returned to unverified review.`
    );
  }

  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true, removed });
}
