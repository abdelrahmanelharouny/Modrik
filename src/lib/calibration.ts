// Confidence calibration is computed only against explicit human-reviewed
// verdicts. Agent-generated critic outputs are useful workflow signals but are
// not independent ground truth and must never be used as calibration labels.
import { db } from "@/lib/db";
import { calculateHumanCalibration } from "@/lib/calibration/metrics.mjs";

export interface CalibrationBin {
  range: string;
  low: number;
  high: number;
  n: number;
  avgConfidence: number;
  empirical: number;
  delta: number;
}

export interface CalibrationProfile {
  n: number;
  brier: number | null;
  ece: number | null;
  verdict: "well-calibrated" | "overconfident" | "underconfident" | "mixed-calibration" | "insufficient-data";
  bins: CalibrationBin[];
  spread: { supportedAvg: number | null; weakAvg: number | null };
  labelSource: "human-reviewed";
}

export async function computeCalibration(projectId: string): Promise<CalibrationProfile> {
  const requirements = await db.requirement.findMany({
    where: {
      projectId,
      confidence: { gte: 0, lte: 100 },
      verificationSource: "human",
      verifiedAt: { not: null },
      verifyStatus: { in: ["supported", "weak"] },
    },
    select: {
      confidence: true,
      verifyStatus: true,
      verificationSource: true,
    },
  });
  return {
    ...calculateHumanCalibration(requirements),
    labelSource: "human-reviewed",
  };
}
