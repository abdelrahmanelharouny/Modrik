import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Fleet telemetry — every number on Mission Control is computed
// live from the database (dynamicity rule: no static numbers).
export async function GET() {
  const [missions, inFlight, complete, evidence, requirements, stories, decisions, conflictsResolved, questionsAnswered, assumptionsCarried, plannerRuns, execUndefined, syncMaps, typedEdges] =
    await Promise.all([
      db.project.count(),
      db.project.count({ where: { status: "active" } }),
      db.project.count({ where: { status: "complete" } }),
      db.evidence.count(),
      db.requirement.count(),
      db.userStory.count(),
      db.decisionEntry.count(),
      db.conflict.count({ where: { status: "resolved" } }),
      db.question.count({ where: { resolution: "answered" } }),
      db.question.count({ where: { resolution: "proceed_with_uncertainty" } }),
      db.plannerRun.count(),
      db.execScenario.count({ where: { resolution: "undefined" } }),
      db.syncMap.count(),
      db.reqEdge.count(),
    ]);

  const arabicEvidence = await db.evidence.count({
    where: { OR: [{ language: "ar-EG" }, { language: "codeswitch" }] },
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    fleet: {
      missions,
      inFlight,
      complete,
    },
    totals: {
      evidence,
      requirements,
      stories,
      decisions,
      conflictsResolved,
      questionsAnswered,
      assumptionsCarried,
      arabicEvidence,
      plannerRuns,
      execUndefined,
      syncMaps,
      typedEdges,
    },
  });
}
