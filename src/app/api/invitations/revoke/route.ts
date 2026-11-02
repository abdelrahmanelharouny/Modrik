import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSameOriginMutation } from "@/lib/security/request-origin.mjs";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req.headers, req.nextUrl.protocol)) {
    return NextResponse.json({ error: "Cross-origin invitation revocation rejected" }, { status: 403, headers: noStore });
  }
  const organizationId = req.headers.get("x-modrik-organization-id");
  if (!organizationId) return NextResponse.json({ error: "Organization context required" }, { status: 403, headers: noStore });
  if (!req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415, headers: noStore });
  }
  const body = await req.json().catch(() => null);
  const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
  if (!invitationId || invitationId.length > 128) {
    return NextResponse.json({ error: "A valid invitation ID is required" }, { status: 400, headers: noStore });
  }

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      select: { id: true, userId: true },
    });
    if (!invitation) return false;
    const claimed = await tx.organizationInvitation.updateMany({
      where: { id: invitation.id, organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.membership.updateMany({
      where: { userId: invitation.userId, organizationId, status: "invited" },
      data: { status: "revoked" },
    });
    return true;
  });
  if (!result) return NextResponse.json({ error: "Invitation is no longer pending" }, { status: 409, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
