import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MISSION_LIBRARY } from "@/lib/mission-library";
import { seedMission } from "@/lib/mission-seed";

// Mission Library — curated, fully-developed reference missions.
//   GET  → catalog annotated with live DB state (loaded / projectId)
//   POST → seed a mission into the fleet (idempotent by name)
// The catalog itself is qualitative seed content; once loaded every
// number the UI renders comes from the database (dynamicity rule).

export async function GET() {
  const projects = await db.project.findMany({ select: { id: true, name: true } });
  const byName = new Map(projects.map((p) => [p.name, p.id]));

  const missions = MISSION_LIBRARY.map((m) => ({
    id: m.id,
    name: m.name,
    domain: m.domain,
    domainAr: m.domainAr,
    tagline: m.tagline,
    taglineAr: m.taglineAr,
    focus: m.focus,
    focusAr: m.focusAr,
    languages: m.languages,
    layout: m.layout,
    loaded: byName.has(m.name),
    projectId: byName.get(m.name) ?? null,
  }));

  return NextResponse.json({ missions, total: missions.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const missionId = String(body.missionId ?? "");
  const seed = MISSION_LIBRARY.find((m) => m.id === missionId);
  if (!seed) {
    return NextResponse.json(
      { error: `Unknown missionId — must be one of: ${MISSION_LIBRARY.map((m) => m.id).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const projectId = await seedMission(seed);
    const loadedCount = await db.project.count({ where: { name: seed.name } });
    return NextResponse.json({ projectId, existed: loadedCount > 1, name: seed.name }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: `Seeding failed: ${(e as Error).message}` }, { status: 500 });
  }
}
