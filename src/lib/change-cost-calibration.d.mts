export const CHANGE_COST_MODEL_VERSION: string;
export interface ChangeCostCalibrationSummary {
  sampleCount: number; modelVersion: string;
  fit: { intercept: number; hoursPerEffortPoint: number } | null;
  maeHours: number | null; rmseHours: number | null; meanBiasHours: number | null;
  rankCorrelation: number | null; readiness: "no_observations" | "collecting" | "early_signal" | "review_candidate";
  caveat?: string;
}
export function summarizeChangeCostCalibration(records: Array<{ estimate?: { effortPoints?: number }; outcome?: { actualHours?: number } }>): ChangeCostCalibrationSummary;
