import type { PlannedQuestion } from "../planner";
export declare function selectByUtility(pool: PlannedQuestion[], k?: number, costBudget?: number): PlannedQuestion[];
export declare function selectDistinctPoolIndices(indices: unknown[], poolLength: number, limit?: number): number[];
export declare function clampSignalScore(value: unknown, fallback?: number): number;
export declare function deduplicateQuestions<T extends { text?: string }>(questions: T[]): T[];
export declare function pickSeededIndices(poolLength: number, limit: number, seed: string): number[];
