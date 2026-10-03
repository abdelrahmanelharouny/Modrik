// ─────────────────────────────────────────────────────────────
// I12 — Decision journal: append-only audit trail of every
// human / agent / system decision, server-side helper.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";

export async function logDecision(
  projectId: string,
  stage: string,
  actor: "human" | "agent" | "system",
  action: string,
  detail = ""
): Promise<void> {
  try {
    await db.decisionEntry.create({
      data: {
        projectId,
        stage,
        actor,
        action,
        detail: detail.slice(0, 600),
      },
    });
  } catch {
    // journaling must never break the main flow
  }
}
