export type AuditStatus = "pass" | "warn" | "fail" | "not-assessed";
export declare function auditDataAvailability(count: number, value: number, threshold: number, mode?: "min" | "max"): { status: AuditStatus; detail: string };
export declare function auditConsentCoverage(total: number, consented: number): { status: AuditStatus; ratio: number | null; detail: string };
export declare function auditCredentialEncryption(rows: { encrypted: boolean }[]): { status: AuditStatus; total: number; encrypted: number; detail: string };
export declare function auditSourceCheck(value: boolean | null | undefined, positiveDetail: string, negativeDetail: string, unavailableDetail?: string): { status: AuditStatus; detail: string };
export declare function nearestRankPercentile(values: number[], percentile: number): number | null;
