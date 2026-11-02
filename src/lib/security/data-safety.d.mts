export declare const SYNTHETIC_ANSWER_PREFIX: string;
export declare function isAiEligibleEvidence(evidence: unknown): boolean;
export declare function filterEvidenceForAI<T>(evidences: T[]): T[];
export declare function isHumanStakeholderAnswer(question: unknown): boolean;
export declare function hasHumanQuestionDecision(questions: unknown[]): boolean;
export declare function hasHumanCandidateEdits(candidates: unknown[]): boolean;
export declare function evidenceContentBudget(sourceCount: number, totalBudget?: number, perSourceMax?: number): number;
