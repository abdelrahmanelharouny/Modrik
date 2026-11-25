export const CHANGE_COST_MODEL_VERSION: string;
export const CHANGE_COST_TYPES: readonly string[];
export interface ChangeCostCalibrationSummary {
  sampleCount: number;
  trainingSampleCount: number;
  holdoutSampleCount: number;
  modelVersion: string;
  protocol: "temporal_holdout_v1";
  fit: { intercept: number; hoursPerEffortPoint: number } | null;
  maeHours: number | null;
  rmseHours: number | null;
  meanBiasHours: number | null;
  rankCorrelation: number | null;
  segments: Array<{ changeType: string; sampleCount: number; rankCorrelation: number | null }>;
  readiness: "no_observations" | "collecting" | "early_signal" | "review_candidate";
  caveat: string;
}
export function summarizeChangeCostCalibration(records: Array<{
  estimate?: { effortPoints?: number };
  createdAt?: string | Date;
  outcome?: { actualHours?: number; changeType?: string; recordedAt?: string | Date };
}>): ChangeCostCalibrationSummary;
