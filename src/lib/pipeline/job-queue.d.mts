export type PipelineJobStatus = "queued" | "running" | "retry_wait" | "completed" | "dead";
export declare class PipelineJobLeaseLostError extends Error {
  code: "PIPELINE_JOB_LEASE_LOST";
}
export declare function buildPipelineJobClaimFilter(now?: Date): Record<string, unknown>;
export declare function buildPipelineJobLease(input: {workerId:string;leaseToken:string;now?:Date|string|number;leaseMs?:number}): {status:"running";lockedAt:Date;leaseExpiresAt:Date;lockedBy:string;leaseToken:string;startedAt:Date};
export declare function buildPipelineJobOwnershipFilter(input: {jobId:string;workerId:string;leaseToken:string}): Record<string,unknown>;
export declare function buildPipelineJobHeartbeatData(input?: {now?:Date|string|number;leaseMs?:number}): {leaseExpiresAt:Date};
export declare function sanitizePipelineJobError(value: unknown): string;
export declare function buildPipelineJobRetry(input: {attempts:number;maxAttempts?:number;now?:Date|string|number;baseDelayMs?:number;error?:unknown;permanent?:boolean}): {status:"retry_wait"|"dead";attempts:number;availableAt:Date;lockedAt:null;leaseExpiresAt:null;lockedBy:null;leaseToken:null;lastError:string;completedAt:Date|null;delayMs:number};
export declare function isRetryablePipelineFailure(error: unknown): boolean;
