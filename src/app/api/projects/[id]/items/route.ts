import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";

type Params = { params: Promise<{ id: string }> };

/**
 * Generic HITL item editing endpoint.
 * body: { kind: "question"|"candidate"|"requirement"|"story"|"conflict",
 *         itemId: string, data: object }
 * Every mutation is recorded in the decision journal (I12).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectState = await db.project.findUnique({
    where: { id },
    select: { stageStatus: true },
  });
  if (!projectState) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(projectState.stageStatus)) {
    return NextResponse.json({ error: "Project stage is processing; retry the edit after the current operation completes." }, { status: 409 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid item mutation payload" }, { status: 400 });
  }
  if (body.data !== undefined && (!body.data || typeof body.data !== "object" || Array.isArray(body.data))) {
    return NextResponse.json({ error: "data must be an object" }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  const itemId = String(body.itemId ?? "");
  const data = (body.data ?? {}) as Record<string, unknown>;
  if (!itemId || !kind) {
    return NextResponse.json({ error: "kind and itemId are required" }, { status: 400 });
  }

  const touch = { updatedAt: new Date() };

  switch (kind) {
    case "question": {
      const q = await db.question.findFirst({ where: { id: itemId, projectId: id } });
      if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });

      // I1 — ask-vs-proceed: mark as "proceed with marked uncertainty"
      if (data.action === "proceed_with_uncertainty") {
        await db.question.update({
          where: { id: itemId },
          data: {
            resolution: "proceed_with_uncertainty",
            answered: true,
            answer: q.fallbackAssumption
              ? `(proceeding with uncertainty — assume: ${q.fallbackAssumption})`
              : "(proceeding with uncertainty — no assumption recorded)",
            answerSource: "assumption",
          },
        });
        await logDecision(
          id,
          "ELICITATION",
          "human",
          "proceed_with_uncertainty",
          `Skipped asking: "${q.text.slice(0, 120)}" — carrying assumption: ${q.fallbackAssumption ?? "(none)"}`
        );
        break;
      }

      // reopen a previously resolved question
      if (data.action === "reopen") {
        await db.question.update({
          where: { id: itemId },
          data: { resolution: "pending", answered: false, answer: null, answerSource: "human" },
        });
        await logDecision(id, "ELICITATION", "human", "question_reopened", q.text.slice(0, 200));
        break;
      }

      const answer = String(data.answer ?? "").slice(0, 2000);
      await db.question.update({
        where: { id: itemId },
        data: {
          answer,
          answered: answer.trim().length > 0,
          resolution: answer.trim() ? "answered" : "pending",
          answerSource: "human",
        },
      });
      if (answer.trim()) {
        await logDecision(id, "ELICITATION", "human", "answered_question", `Q: ${q.text.slice(0, 150)} → A: ${answer.slice(0, 200)}`);
      }
      break;
    }

    case "candidate": {
      const c = await db.problemCandidate.findFirst({ where: { id: itemId, projectId: id } });
      if (!c) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
      const patch: Record<string, unknown> = {};
      for (const field of ["impact", "effort"] as const) {
        const value = data[field];
        if (value === undefined) continue;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 1 || numeric > 5) {
          return NextResponse.json({ error: `${field} must be a finite number from 1 to 5` }, { status: 400 });
        }
        patch[field] = Math.round(numeric);
      }
      if (data.selected !== undefined && typeof data.selected !== "boolean") {
        return NextResponse.json({ error: "selected must be a boolean" }, { status: 400 });
      }

      if (data.selected === true) {
        // Compare-and-swap on the project row prevents two simultaneous
        // requests from leaving two selected candidates in the same project.
        const projectVersion = await db.project.findUnique({
          where: { id },
          select: { updatedAt: true },
        });
        if (!projectVersion) return NextResponse.json({ error: "Project not found" }, { status: 404 });
        await db.$transaction(async (tx) => {
          // Compare-and-swap on the owning Project row serializes competing
          // selections without relying on a DB-specific isolation override.
          const claimed = await tx.project.updateMany({
            where: { id, updatedAt: projectVersion.updatedAt },
            data: { updatedAt: new Date() },
          });
          if (claimed.count !== 1) {
            throw new Error("Project changed during candidate selection. Refresh and retry.");
          }
          await tx.problemCandidate.updateMany({ where: { projectId: id }, data: { selected: false } });
          await tx.problemCandidate.update({ where: { id: itemId, projectId: id }, data: { ...patch, selected: true, humanEdited: true } });
        });
        await logDecision(
          id,
          "PROBLEM_SELECTION",
          "human",
          "selected_problem",
          `"${c.title}" — impact ${patch.impact ?? c.impact}/5, effort ${patch.effort ?? c.effort}/5`
        );
      } else {
        if (data.selected === false) patch.selected = false;
        if (Object.keys(patch).length > 0) patch.humanEdited = true;
        await db.problemCandidate.update({ where: { id: itemId, projectId: id }, data: patch });
        if (data.selected === false && c.selected) {
          await logDecision(id, "PROBLEM_SELECTION", "human", "deselected_problem", c.title.slice(0, 180));
        }
        if (patch.impact !== undefined || patch.effort !== undefined) {
          await logDecision(
            id,
            "PROBLEM_SELECTION",
            "human",
            "candidate_tuned",
            `"${c.title}" re-scored: impact ${patch.impact ?? c.impact}, effort ${patch.effort ?? c.effort}`
          );
        }
      }
      break;
    }

    case "requirement": {
      const r = await db.requirement.findFirst({
        where: { id: itemId, projectId: id },
        include: { links: { select: { id: true, evidenceId: true } } },
      });
      if (!r) return NextResponse.json({ error: "Requirement not found" }, { status: 404 });

      if (data.attachEvidenceId !== undefined) {
        if (typeof data.attachEvidenceId !== "string" || !data.attachEvidenceId.trim()) {
          return NextResponse.json({ error: "attachEvidenceId must be a non-empty evidence ID" }, { status: 400 });
        }
        const evidence = await db.evidence.findFirst({
          where: { id: data.attachEvidenceId, projectId: id },
          select: { id: true, code: true, title: true },
        });
        if (!evidence) {
          return NextResponse.json({ error: "Evidence source not found in this project" }, { status: 404 });
        }
        const existingLink = await db.traceLink.findFirst({
          where: { projectId: id, requirementId: r.id, evidenceId: evidence.id },
          select: { id: true },
        });
        if (existingLink) {
          return NextResponse.json({ ok: true, alreadyLinked: true });
        }
        await db.$transaction(async (tx) => {
          await tx.traceLink.create({
            data: {
              projectId: id,
              requirementId: r.id,
              evidenceId: evidence.id,
              evidenceCode: evidence.code,
              note: "Manually linked by the project owner.",
            },
          });
          await tx.requirement.update({
            where: { id: r.id },
            data: {
              status: "revised",
              verifyStatus: "unverified",
              verificationSource: "unverified",
              verifiedAt: null,
              verifiedBy: null,
              verifyNote: "Evidence was linked manually. Review the cited source before recording a verification decision.",
            },
          });
        });
        await logDecision(
          id,
          "EXTRACTION",
          "human",
          "attached_evidence",
          `${r.refId} linked to ${evidence.code} "${evidence.title.slice(0, 120)}".`
        );
        break;
      }

      if (data.driftDecision !== undefined) {
        if (data.driftDecision !== "confirmed" && data.driftDecision !== "dismissed") {
          return NextResponse.json({ error: "driftDecision must be confirmed or dismissed" }, { status: 400 });
        }
        if (r.driftStatus === "none") {
          return NextResponse.json({ error: "This requirement has no pending drift signal to review." }, { status: 409 });
        }
        const nextStatus = data.driftDecision === "confirmed" ? "confirmed" : "none";
        await db.requirement.update({
          where: { id: itemId },
          data: { driftStatus: nextStatus },
        });
        await logDecision(
          id,
          "LIFECYCLE",
          "human",
          data.driftDecision === "confirmed" ? "confirmed_requirement_drift" : "dismissed_requirement_drift",
          `${r.refId}: human reviewer ${data.driftDecision} the suspected change impact.`
        );
        break;
      }

      if (data.verificationDecision !== undefined) {
        if (data.verificationDecision !== "supported" && data.verificationDecision !== "weak") {
          return NextResponse.json({ error: "verificationDecision must be supported or weak" }, { status: 400 });
        }
        if (r.links.length === 0) {
          return NextResponse.json({ error: "A requirement must have at least one evidence trace link before a human verification decision." }, { status: 422 });
        }
        await db.requirement.update({
          where: { id: itemId },
          data: {
            verifyStatus: data.verificationDecision,
            verificationSource: "human",
            verifiedAt: new Date(),
            verifiedBy: "owner",
            verifyNote: "Human reviewer inspected the linked evidence and recorded this independent verdict.",
          },
        });
        await logDecision(
          id,
          "EXTRACTION",
          "human",
          "human_verification",
          `${r.refId}: human reviewer marked cited evidence as ${data.verificationDecision}.`
        );
        break;
      }

      // apply the ambiguity agent's suggested rewrite
      if (data.action === "apply_suggestion") {
        if (!r.suggestion) {
          return NextResponse.json({ error: "No suggestion to apply" }, { status: 422 });
        }
        await db.requirement.update({
          where: { id: itemId },
          data: {
            text: r.suggestion,
            suggestion: null,
            status: "revised",
            verifyStatus: "unverified",
            verificationSource: "unverified",
            verifiedAt: null,
            verifiedBy: null,
            verifyNote: "Requirement text changed; previous evidence verification is stale.",
          },
        });
        await logDecision(id, "AMBIGUITY", "human", "applied_rewrite", `${r.refId}: "${r.text.slice(0, 150)}" → "${r.suggestion.slice(0, 150)}"`);
        break;
      }

      const patch: Record<string, unknown> = {};
      if (typeof data.text === "string" && data.text.trim())
        patch.text = data.text.trim().slice(0, 800);
      if (typeof data.type === "string" && ["functional", "nonfunctional", "constraint"].includes(data.type))
        patch.type = data.type;
      if (typeof data.priority === "string" && ["Must", "Should", "Could", "Won't"].includes(data.priority))
        patch.priority = data.priority;
      if (Object.keys(patch).length > 0) patch.status = "revised";
      if (typeof patch.text === "string") {
        Object.assign(patch, {
          verifyStatus: "unverified",
          verificationSource: "unverified",
          verifiedAt: null,
          verifiedBy: null,
          verifyNote: "Requirement text changed; previous evidence verification is stale.",
        });
      }
      await db.requirement.update({ where: { id: itemId }, data: patch });
      if (Object.keys(patch).length > 0) {
        await logDecision(id, "EXTRACTION", "human", "edited_requirement", `${r.refId} updated (${Object.keys(patch).join(", ")}).`);
      }
      break;
    }

    case "story": {
      const s = await db.userStory.findFirst({ where: { id: itemId, projectId: id } });
      if (!s) return NextResponse.json({ error: "Story not found" }, { status: 404 });
      const patch: Record<string, unknown> = {};
      if (typeof data.title === "string" && data.title.trim()) patch.title = data.title.trim().slice(0, 200);
      if (typeof data.narrative === "string" && data.narrative.trim()) patch.narrative = data.narrative.trim().slice(0, 800);
      if (typeof data.acceptance === "string") patch.acceptance = data.acceptance.slice(0, 2000);
      if (Object.keys(patch).length > 0) patch.status = "revised";
      await db.userStory.update({ where: { id: itemId }, data: patch });
      if (Object.keys(patch).length > 0) {
        await logDecision(id, "STORIES", "human", "edited_story", `${s.refId} updated (${Object.keys(patch).join(", ")}).`);
      }
      break;
    }

    case "conflict": {
      const c = await db.conflict.findFirst({
        where: { id: itemId, projectId: id },
        include: { reqA: true, reqB: true },
      });
      if (!c) return NextResponse.json({ error: "Conflict not found" }, { status: 404 });
      if (data.resolution !== undefined && typeof data.resolution !== "string") {
        return NextResponse.json({ error: "resolution must be a string" }, { status: 400 });
      }
      const resolution = String(data.resolution ?? "").slice(0, 1000);
      await db.conflict.update({
        where: { id: itemId },
        data: {
          resolution: resolution || c.resolution,
          status: resolution.trim() ? "resolved" : c.status,
        },
      });
      if (resolution.trim() && c.status !== "resolved") {
        // Audit fix: c.reqARef/reqBRef never existed on the model — journal
        // entries used to read "undefined ↔ undefined". Use the related refIds.
        await logDecision(id, "CONFLICTS", "human", "resolved_conflict", `${c.reqA.refId} ↔ ${c.reqB.refId} (${c.kind}): ${resolution.slice(0, 200)}`);
      }
      break;
    }

    default:
      return NextResponse.json({ error: "Unknown item kind" }, { status: 400 });
  }

  await db.project.update({ where: { id }, data: touch });
  return NextResponse.json({ ok: true });
}

// Delete a requirement or story (human curation)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectState = await db.project.findUnique({
    where: { id },
    select: { stageStatus: true },
  });
  if (!projectState) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(projectState.stageStatus)) {
    return NextResponse.json({ error: "Project stage is processing; retry the deletion after it completes." }, { status: 409 });
  }
  const kind = new URL(req.url).searchParams.get("kind");
  const itemId = new URL(req.url).searchParams.get("itemId");
  if (!kind || !itemId) {
    return NextResponse.json({ error: "kind and itemId are required" }, { status: 400 });
  }
  if (kind === "requirement") {
    const r = await db.requirement.findFirst({ where: { id: itemId, projectId: id } });
    await db.requirement.deleteMany({ where: { id: itemId, projectId: id } });
    if (r) await logDecision(id, "EXTRACTION", "human", "deleted_requirement", `${r.refId}: ${r.text.slice(0, 200)}`);
  } else if (kind === "story") {
    const story = await db.userStory.findFirst({ where: { id: itemId, projectId: id } });
    await db.userStory.deleteMany({ where: { id: itemId, projectId: id } });
    if (story) await logDecision(id, "STORIES", "human", "deleted_story", `${story.refId}: ${story.title.slice(0, 180)}`);
  } else if (kind === "conflict") {
    const conflict = await db.conflict.findFirst({
      where: { id: itemId, projectId: id },
      include: { reqA: true, reqB: true },
    });
    await db.conflict.deleteMany({ where: { id: itemId, projectId: id } });
    if (conflict) {
      await logDecision(
        id,
        "CONFLICTS",
        "human",
        "deleted_conflict",
        `${conflict.reqA.refId} ↔ ${conflict.reqB.refId}: ${conflict.description.slice(0, 180)}`
      );
    }
  } else {
    return NextResponse.json({ error: "Unknown item kind" }, { status: 400 });
  }
  await db.project.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
