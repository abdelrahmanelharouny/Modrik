import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDrift } from "@/lib/agents";
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
  let reservation = await db.syncMap.findUnique({ where: { idempotencyKey }, select: { id: true, direction: true } });
  if (!reservation) {
    try {
      reservation = await db.syncMap.create({
        data: {
          projectId,
          kind: "github-webhook",
          direction: "pending",
          localLabel: eventName + (payloadAction ? ":" + payloadAction : ""),
          externalKey: deliveryId,
          externalUrl: event.url,
          title: event.title.slice(0, 200),
          idempotencyKey,
          leaseExpiresAt: null,
        },
        select: { id: true, direction: true },
      });
    } catch {
      reservation = await db.syncMap.findUnique({ where: { idempotencyKey }, select: { id: true, direction: true } });
      if (!reservation) return NextResponse.json({ error: "Could not reserve webhook delivery" }, { status: 503 });
    }
  }

  if (reservation.direction === "pulled") {
    return NextResponse.json({ ok: true, duplicate: true, deliveryId }, { status: 202 });
  }
  const now = new Date();
  const claimed = await db.syncMap.updateMany({
    where: { id: reservation.id, direction: { not: "pulled" }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
    data: { direction: "creating", leaseExpiresAt: new Date(now.getTime() + 2 * 60 * 1000), syncedAt: now },
  });
  if (claimed.count !== 1) {
    return NextResponse.json({ ok: true, duplicate: true, processing: true, deliveryId }, { status: 202 });
  }

  try {
    const result = await runDrift(projectId, event.signal);
    await db.syncMap.update({
      where: { id: reservation.id },
      data: { direction: "pulled", externalKey: event.key, externalUrl: event.url, title: event.title.slice(0, 200), leaseExpiresAt: null, syncedAt: new Date() },
    });
    return NextResponse.json({ ok: true, deliveryId, drift: result }, { status: 202 });
  } catch {
    await db.syncMap.updateMany({
      where: { id: reservation.id, direction: "creating" },
      data: { direction: "failed", leaseExpiresAt: null },
    });
    return NextResponse.json({ error: "Drift processing failed; GitHub may safely retry this delivery", deliveryId }, { status: 502 });
  }
}
