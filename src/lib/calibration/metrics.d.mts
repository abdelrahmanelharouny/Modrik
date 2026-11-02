import type { CalibrationProfile } from "../calibration";
export declare function calculateHumanCalibration(requirements: unknown[]): CalibrationProfile & { verdict: "well-calibrated" | "overconfident" | "underconfident" | "mixed-calibration" | "insufficient-data"; brier: number | null; ece: number | null };
