export interface HealthMetric {
  score: number | null;
  assessed: boolean;
  coverage: number | null;
}
export interface HealthScores {
  ambiguity: HealthMetric;
  verification: HealthMetric;
  uncertainty: HealthMetric;
  conflict: HealthMetric;
  traceability: HealthMetric;
  executability: HealthMetric;
  counts: {
    totalRequirements: number;
    assessedAmbiguity: number;
    weakVerification: number;
    unverified: number;
    decidedQuestions: number;
    pendingQuestions: number;
    assumptions: number;
    openConflicts: number;
    untraced: number;
    undefinedScenarios: number;
    definedScenarios: number;
  };
}
export declare function computeHealthScores(input: {
  requirements?: any[];
  questions?: any[];
  conflicts?: any[];
  scenarios?: any[];
  conflictDetectionComplete?: boolean;
}): HealthScores;
