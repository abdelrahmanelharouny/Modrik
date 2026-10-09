// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — MISSION LIBRARY SEEDER
// Turns a MissionSeed into a fully populated project (dynamicity:
// everything becomes DB rows; the UI renders them from the APIs).
// Idempotent by project name.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import type { MissionSeed } from "@/lib/mission-library";

function projectState(seed: MissionSeed): { status: string; currentStage: string; stageStatus: string } {
  switch (seed.layout) {
    case "landed":
      return { status: "complete", currentStage: "CONFLICTS", stageStatus: "approved" };
    case "briefing":
      return { status: "active", currentStage: "ELICITATION", stageStatus: "awaiting_input" };
    case "selection":
      return { status: "active", currentStage: "PROBLEM_SELECTION", stageStatus: "awaiting_input" };
    case "ambiguity":
      return { status: "active", currentStage: "AMBIGUITY", stageStatus: "awaiting_review" };
    case "stories":
      return { status: "active", currentStage: "STORIES", stageStatus: "awaiting_review" };
    case "clearance":
      return { status: "active", currentStage: "CONFLICTS", stageStatus: "awaiting_review" };
  }
}

export async function seedMission(seed: MissionSeed): Promise<string> {
  const existing = await db.project.findFirst({ where: { name: seed.name }, select: { id: true } });
  if (existing) return existing.id;

  const state = projectState(seed);

  const project = await db.project.create({
    data: {
      name: seed.name,
      brief: seed.brief,
      status: state.status,
      currentStage: state.currentStage,
      stageStatus: state.stageStatus,
      evidences: {
        create: seed.evidences.map((e) => ({
          code: e.code,
          title: e.title,
          sourceType: e.sourceType,
          language: e.language,
          content: e.content,
          consent: e.consent ?? true,
          origin: "human",
        })),
      },
      questions: {
        create: (seed.questions ?? []).map((q, i) => ({
          order: i + 1,
          text: q.text,
          rationale: q.rationale ?? null,
          priority: q.priority,
          askCost: q.askCost,
          fallbackAssumption: q.fallback,
          utility: q.utility ? JSON.stringify(q.utility) : null,
          answer: q.answer ?? null,
          answered: q.resolution === "answered",
          resolution: q.resolution ?? "pending",
        })),
      },
      candidates: {
        create: (seed.candidates ?? []).map((c) => ({
          title: c.title,
          description: c.description,
          impact: c.impact,
          effort: c.effort,
          selected: c.selected,
        })),
      },
      decisions: {
        create: (seed.decisions ?? []).map((d) => ({
          stage: d.stage,
          actor: d.actor,
          action: d.action,
          detail: d.detail,
        })),
      },
      runs: {
        create: (seed.runs ?? []).map((r) => ({
          stage: r.stage,
          status: r.status,
          log: `Seeded library run — ${seed.id}`,
          latencyMs: r.latencyMs,
          estTokens: r.estTokens,
          estCostUsd: r.estCostUsd,
          promptVersion: "v2.1-audit",
          completedAt: new Date(),
        })),
      },
    },
  });

  const reqIdByRef = new Map<string, string>();

  for (const [i, r] of (seed.requirements ?? []).entries()) {
    const created = await db.requirement.create({
      data: {
        projectId: project.id,
        refId: r.refId,
        text: r.text,
        type: r.type,
        priority: r.priority,
        ambiguity: r.ambiguity ?? -1,
        ambiguityNote: r.ambiguityNote ?? null,
        suggestion: r.suggestion ?? null,
        confidence: r.confidence ?? -1,
        verifyStatus: r.verify ?? "unverified",
        verifyNote: r.verifyNote ?? null,
        language: r.language ?? "en",
        status: seed.layout === "landed" ? "approved" : "draft",
        order: i + 1,
      },
    });
    reqIdByRef.set(r.refId, created.id);
    await db.traceLink.createMany({
      data: r.evidence.map((code) => ({ projectId: project.id, requirementId: created.id, evidenceCode: code })),
    });
  }

  for (const s of seed.stories ?? []) {
    const requirementId = reqIdByRef.get(s.req);
    if (!requirementId) continue;
    await db.userStory.create({
      data: {
        projectId: project.id,
        requirementId,
        refId: s.refId,
        title: s.title,
        narrative: s.narrative,
        acceptance: s.acceptance.join("\n"),
        investScore: s.invest ?? null,
        status: s.status ?? (seed.layout === "landed" ? "approved" : "draft"),
      },
    });
  }

  for (const c of seed.conflicts ?? []) {
    const a = reqIdByRef.get(c.a);
    const b = reqIdByRef.get(c.b);
    if (!a || !b) continue;
    await db.conflict.create({
      data: {
        projectId: project.id,
        reqAId: a,
        reqBId: b,
        kind: c.kind,
        taxonomy: c.taxonomy ?? null,
        description: c.description,
        severity: c.severity,
        implications: c.implications ? JSON.stringify(c.implications) : null,
        resolution: c.resolution ?? null,
        status: c.resolution ? "resolved" : "open",
      },
    });
  }

  for (const e of seed.edges ?? []) {
    const from = reqIdByRef.get(e.from);
    const to = reqIdByRef.get(e.to);
    if (!from || !to) continue;
    await db.reqEdge.create({
      data: { projectId: project.id, fromId: from, toId: to, kind: e.kind, note: e.note ?? null, origin: "agent" },
    });
  }

  for (const x of seed.execs ?? []) {
    const requirementId = x.req ? (reqIdByRef.get(x.req) ?? null) : null;
    await db.execScenario.create({
      data: {
        projectId: project.id,
        requirementId,
        refId: x.resolution === "undefined" ? (x.gapId ?? "GAP-99") : (x.req ?? "GAP-99"),
        given: x.given,
        when: x.when,
        then: x.then,
        resolution: x.resolution,
        undefinedReason: x.undefinedReason ?? null,
        discovery: x.discovery ?? null,
      },
    });
  }

  // One planner run per landed mission (impact-aware arm) so the Planner Lab
  // shows the seeded arm; other arms can be exercised live from the UI.
  if (seed.layout === "landed" && seed.questions?.length) {
    const selected = seed.questions
      .filter((q) => q.utility)
      .map((q) => ({ text: q.text, utility: q.utility }));
    if (selected.length) {
      await db.plannerRun.create({
        data: {
          projectId: project.id,
          arm: "impact_aware",
          questions: JSON.stringify(selected),
          metrics: JSON.stringify({
            avgUtility: Math.round(selected.reduce((a, q) => a + (q.utility?.utility ?? 0), 0) / selected.length),
            utilityPerCost: Math.round(
              selected.reduce((a, q) => a + (q.utility?.utility ?? 0), 0) /
                Math.max(1, selected.reduce((a, q) => a + (q.utility?.askCost ?? 1), 0))
            ),
            evidenceCoverage: 1.0,
            redundancyRate: 0.0,
            dialectFit: seed.languages.includes("ar-EG") || seed.languages.includes("codeswitch") ? 0.92 : 0.71,
          }),
          candidates: selected.length,
          promptVersion: "v2.1-audit",
        },
      });
    }
  }

  return project.id;
}
