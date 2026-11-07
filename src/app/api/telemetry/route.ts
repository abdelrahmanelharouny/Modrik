import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Fleet telemetry — every number on Mission Control is computed
// live from the database (dynamicity rule: no static numbers).
export async function GET(req: Request) {
  const organizationId = req.headers.get("x-modrik-organization-id");
  const projectScope = organizationId ? { project: { organizationId } } : {};
  const [missions, inFlight, complete, evidence, requirements, stories, decisions, conflictsResolved, questionsAnswered, assumptionsCarried, plannerRuns, execUndefined, syncMaps, typedEdges] =
    await Promise.all([
      db.project.count({ where: organizationId ? { organizationId } : {} }),
      db.project.count({ where: { ...(organizationId ? { organizationId } : {}), status: "active" } }),
      db.project.count({ where: { ...(organizationId ? { organizationId } : {}), status: "complete" } }),
      db.evidence.count({ where: projectScope }),
      db.requirement.count({ where: projectScope }),
      db.userStory.count({ where: projectScope }),
      db.decisionEntry.count({ where: projectScope }),
      db.conflict.count({ where: { ...projectScope, status: "resolved" } }),
      db.question.count({ where: { ...projectScope, resolution: "answered" } }),
      db.question.count({ where: { ...projectScope, resolution: "proceed_with_uncertainty" } }),
      db.plannerRun.count({ where: projectScope }),
      db.execScenario.count({ where: { ...projectScope, resolution: "undefined" } }),
      db.syncMap.count({ where: projectScope }),
      db.reqEdge.count({ where: projectScope }),
    ]);

  const arabicEvidence = await db.evidence.count({
    where: { ...projectScope, OR: [{ language: "ar-EG" }, { language: "codeswitch" }] },
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
