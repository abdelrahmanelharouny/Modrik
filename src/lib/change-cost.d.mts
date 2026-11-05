export interface ChangeCostFactor { id: string; count: number; }
export interface ChangeCostBreakdown {
  requirementId: string; requirementRef: string | null; depth: number; relationKinds: string[];
  depthWeight: number; relationWeight: number; baseExposure: number; riskMultiplier: number;
  riskUplift: number; effortPoints: number; riskFactors: string[]; uncertaintyReasons: string[];
}
export interface ChangeCostUncertainty {
  score: number; percent: number; bandPercent: number; missingSignals: number; totalSignals: number;
  factors: ChangeCostFactor[]; interpretation: string;
}
export interface ChangeCostEstimate {
  rootRef: string | null; affectedRequirements: number; directImpact: number; transitiveImpact: number;
  highRiskRequirements: number; effortPoints: number; effortRange: { low: number; high: number };
  uncertainty: ChangeCostUncertainty; breakdown: ChangeCostBreakdown[];
  factors: ChangeCostFactor[]; methodology: string; caveat: string;
}
export function estimateChangeCost(
  root: { id: string; refId?: string; priority?: string; ambiguity?: number; driftStatus?: string; verifyStatus?: string },
  impacted: Array<{ id: string; depth: number; via?: Array<{ kind: string }> }>,
  requirements: Array<{ id: string; refId?: string; priority?: string; ambiguity?: number; driftStatus?: string; verifyStatus?: string }>,
): ChangeCostEstimate;
