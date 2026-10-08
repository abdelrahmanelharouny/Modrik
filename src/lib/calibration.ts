// ─────────────────────────────────────────────────────────────
// RequirementPilot — CALIBRATION VALIDATION (open requirement 1)
//
// Validates the extraction agent's self-reported confidence (I2)
// against the critic-verifier's outcomes (I3):
//   outcome = 1 when verifyStatus === "supported"
//   outcome = 0 when verifyStatus === "weak"
//
// Produces: reliability bins, Brier score, ECE (expected
// calibration error), over/under-confidence deltas — the numbers
// the thesis needs to claim "confidence means something".
// Deterministic: computed purely from stored records.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";

export interface CalibrationBin {
  range: string;
  low: number;
  high: number;
  n: number;
  avgConfidence: number; // what the agent claimed
  empirical: number; // what reality showed (0..1)
  delta: number; // claimed − empirical (positive = overconfident)
}

export interface CalibrationProfile {
  n: number;
  brier: number; // 0 perfect .. 1 worst
  ece: number; // expected calibration error 0..1
  verdict: "well-calibrated" | "overconfident" | "underconfident" | "insufficient-data";
  bins: CalibrationBin[];
  spread: { supportedAvg: number | null; weakAvg: number | null };
}

const BIN_EDGES: [number, number][] = [
  [0, 40],
  [40, 60],
  [60, 80],
  [80, 100],
];

export async function computeCalibration(projectId: string): Promise<CalibrationProfile> {
  const reqs = await db.requirement.findMany({
    where: { projectId, confidence: { gte: 0 }, verifyStatus: { in: ["supported", "weak"] } },
  });

  const n = reqs.length;
  if (n < 3) {
    return {
      n,
      brier: 0,
      ece: 0,
      verdict: "insufficient-data",
      bins: [],
      spread: { supportedAvg: null, weakAvg: null },
    };
  }

  // Brier score: mean (confidence/100 − outcome)²
  const brier =
    reqs.reduce((s, r) => {
      const p = r.confidence / 100;
      const o = r.verifyStatus === "supported" ? 1 : 0;
      return s + (p - o) ** 2;
    }, 0) / n;

  // Reliability bins
  const bins: CalibrationBin[] = BIN_EDGES.map(([low, high]) => {
    const inBin = reqs.filter((r) => (low === 0 ? r.confidence < high : r.confidence >= low && r.confidence < high));
    const avgConfidence = inBin.length ? inBin.reduce((s, r) => s + r.confidence, 0) / inBin.length : 0;
    const empirical = inBin.length ? inBin.filter((r) => r.verifyStatus === "supported").length / inBin.length : 0;
    return {
      range: `${low}–${high}`,
      low,
      high,
      n: inBin.length,
      avgConfidence: Math.round(avgConfidence),
      empirical: +empirical.toFixed(3),
      delta: inBin.length ? +(avgConfidence / 100 - empirical).toFixed(3) : 0,
    };
  }).filter((b) => b.n > 0);

  // ECE: weighted mean |claimed − empirical|
  const ece = bins.reduce((s, b) => s + (b.n / n) * Math.abs(b.delta), 0);

  const supported = reqs.filter((r) => r.verifyStatus === "supported");
  const weak = reqs.filter((r) => r.verifyStatus === "weak");
  const supportedAvg = supported.length ? Math.round(supported.reduce((s, r) => s + r.confidence, 0) / supported.length) : null;
  const weakAvg = weak.length ? Math.round(weak.reduce((s, r) => s + r.confidence, 0) / weak.length) : null;

  // verdict: net bias across populated bins
  const netDelta = bins.reduce((s, b) => s + b.delta * b.n, 0) / n;
  const verdict: CalibrationProfile["verdict"] =
    ece <= 0.1 ? "well-calibrated" : netDelta > 0.05 ? "overconfident" : netDelta < -0.05 ? "underconfident" : "well-calibrated";

  return { n, brier: +brier.toFixed(4), ece: +ece.toFixed(4), verdict, bins, spread: { supportedAvg, weakAvg } };
}
