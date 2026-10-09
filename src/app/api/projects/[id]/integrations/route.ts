import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  maskedStatus,
  saveConfig,
  githubPush,
  githubPull,
  jiraPush,
  jiraPull,
  testConnection,
  listSyncMaps,
} from "@/lib/integrations";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [status, maps] = await Promise.all([maskedStatus(id), listSyncMaps(id)]);
  return NextResponse.json({ status, maps });
}

// POST { kind, action, config? }
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "");
  const action = String(body.action ?? "");
  if (kind !== "github" && kind !== "jira") {
    return NextResponse.json({ error: "kind must be github | jira" }, { status: 400 });
  }
  const project = await db.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    switch (action) {
      case "save-config": {
        const cfg = body.config ?? {};
        for (const k of Object.keys(cfg)) cfg[k] = String(cfg[k] ?? "").slice(0, 400);
        const status = await saveConfig(id, kind, cfg);
        return NextResponse.json({ ok: true, status });
      }
      case "test":
        return NextResponse.json(await testConnection(id, kind));
      case "push":
        return NextResponse.json(kind === "github" ? { ok: true, ...(await githubPush(id)) } : { ok: true, ...(await jiraPush(id)) });
      case "pull":
        return NextResponse.json(kind === "github" ? { ok: true, ...(await githubPull(id)) } : { ok: true, ...(await jiraPull(id)) });
      default:
        return NextResponse.json({ error: "Unknown action — expected save-config | test | push | pull" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 502 }
    );
  }
}
