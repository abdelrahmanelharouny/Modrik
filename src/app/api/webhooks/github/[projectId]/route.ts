import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueChangeImpactJob } from "@/lib/pipeline/change-impact";
import { getGitHubWebhookConfig } from "@/lib/integrations";
import { normalizeGitHubWebhook, verifyGitHubWebhookSignature } from "@/lib/integrations/github-webhook.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
    return NextResponse.json({ error: "Webhook payload exceeds 1 MB" }, { status: 413 });
  }

  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const eventName = request.headers.get("x-github-event");
  const action = request.headers.get("x-github-event-action");
  if (!/^[A-Za-z0-9-]{16,100}$/.test(deliveryId) || !eventName) {
    return NextResponse.json({ error: "Missing or invalid GitHub delivery metadata" }, { status: 400 });
  }

  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let integration;
  try {
    integration = await getGitHubWebhookConfig(projectId);
  } catch {
    return NextResponse.json({ error: "Webhook configuration is invalid" }, { status: 503 });
  }
  if (!integration) return NextResponse.json({ error: "GitHub webhook is not configured" }, { status: 404 });

  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Webhook body is required" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 1_000_000) {
        await reader.cancel();
        return NextResponse.json({ error: "Webhook payload exceeds 1 MB" }, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!verifyGitHubWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), integration.secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Webhook body must be valid JSON" }, { status: 400 }); }
  const payloadAction = payload && typeof payload === "object" && !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).action === "string"
      ? String((payload as Record<string, unknown>).action)
      : action;
  const event = normalizeGitHubWebhook(eventName, payloadAction, payload);
  if (!event) return NextResponse.json({ ok: true, ignored: true, reason: "Unsupported event or action" }, { status: 202 });

  const expectedRepository = integration.owner.toLowerCase() + "/" + integration.repo.toLowerCase();
  if (event.repository.toLowerCase() !== expectedRepository) {
    return NextResponse.json({ error: "Webhook repository does not match the configured integration" }, { status: 403 });
  }

  const idempotencyKey = "github-webhook:" + projectId + ":" + createHash("sha256").update(deliveryId).digest("hex");
  try {
    const queued = await enqueueChangeImpactJob({
      projectId, source: "github", idempotencyKey, signal: event.signal.slice(0, 2000),
      externalKey: event.key, externalUrl: event.url, title: event.title,
    });
    return NextResponse.json({
      ok: true, queued: true, duplicate: queued.duplicate,
      jobId: queued.jobId, jobStatus: queued.status, deliveryId,
    }, { status: 202, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Could not enqueue change-impact processing; the provider may retry this delivery", deliveryId }, { status: 503 });
  }
}
