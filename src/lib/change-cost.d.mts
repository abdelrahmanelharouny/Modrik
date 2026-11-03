export interface ChangeCostFactor { id: string; count: number; }
export interface ChangeCostEstimate {
  rootRef: string; affectedRequirements: number; directImpact: number; transitiveImpact: number;
  highRiskRequirements: number; effortPoints: number; effortRange: { low: number; high: number };
  factors: ChangeCostFactor[]; methodology: string; caveat: string;
}
export function estimateChangeCost(
  root: { id: string; refId: string; priority?: string; ambiguity?: number; driftStatus?: string; verifyStatus?: string },
  impacted: Array<{ id: string; depth: number; via?: Array<{ kind: string }> }>,
  requirements: Array<{ id: string; priority?: string; ambiguity?: number; driftStatus?: string; verifyStatus?: string }>,
): ChangeCostEstimate;
