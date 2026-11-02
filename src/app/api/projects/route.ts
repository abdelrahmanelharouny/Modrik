import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const organizationId = req.headers.get("x-modrik-organization-id");
  const projects = await db.project.findMany({
    ...(organizationId ? { where: { organizationId } } : {}),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      brief: true,
      status: true,
      currentStage: true,
      stageStatus: true,
      isDemo: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { evidences: true, reqs: true, stories: true } },
    },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const brief = String(body.brief ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }
  const organizationId = req.headers.get("x-modrik-organization-id");
  const userId = req.headers.get("x-modrik-user-id");
  const project = await db.project.create({
    data: {
      name: name.slice(0, 120),
      brief: brief.slice(0, 6000),
      ...(organizationId && userId ? { organizationId, createdByUserId: userId } : {}),
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
