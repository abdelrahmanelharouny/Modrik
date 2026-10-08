import { NextRequest, NextResponse } from "next/server";
import { computeCalibration } from "@/lib/calibration";

type Params = { params: Promise<{ id: string }> };

// Open requirement 1 — calibration validation. Deterministic read:
// confidence (I2) vs critic verdicts (I3), Brier + ECE + bins.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const profile = await computeCalibration(id);
    return NextResponse.json(profile);
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err).slice(0, 500) },
      { status: 500 }
    );
  }
}
