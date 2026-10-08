import { NextResponse } from "next/server";
import { runSelfAudit } from "@/lib/constraints";

// Platform self-audit (constraint-pack dual role, I11):
// the website checks ITSELF — WCAG 2.2 contrast math on live design
// tokens, performance budgets from telemetry, PDPL structural checks
// from the data. Deterministic, recomputed on every request.
export async function GET() {
  try {
    const audit = await runSelfAudit();
    return NextResponse.json(audit);
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
