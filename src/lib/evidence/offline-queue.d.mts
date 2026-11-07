export interface OfflineEvidencePayload { title: string; sourceType: string; language: string; content: string; consent: boolean; }
export type OfflineEvidenceOperation =
  | { operationId: string; projectId: string; kind?: "create"; payload: OfflineEvidencePayload; createdAt: string; attempts: number; lastError?: string }
  | { operationId: string; projectId: string; kind: "update"; evidenceId: string; expectedRevisionVersion: number; payload: OfflineEvidencePayload; changeNote?: string; createdAt: string; attempts: number; lastError?: string }
  | { operationId: string; projectId: string; kind: "delete"; evidenceId: string; expectedRevisionVersion: number; createdAt: string; attempts: number; lastError?: string };
export function createOfflineEvidenceOperation(projectId: string, payload: OfflineEvidencePayload, operationId?: string): OfflineEvidenceOperation;
export function createOfflineEvidenceMutationOperation(projectId: string, kind: "update" | "delete", evidenceId: string, expectedRevisionVersion: number, payload?: OfflineEvidencePayload, operationId?: string, changeNote?: string): OfflineEvidenceOperation;
export function putOfflineEvidenceOperation(operation: OfflineEvidenceOperation): Promise<void>;
export function listOfflineEvidenceOperations(projectId: string): Promise<OfflineEvidenceOperation[]>;
export function removeOfflineEvidenceOperation(operationId: string): Promise<void>;
export function updateOfflineEvidenceOperation(operation: OfflineEvidenceOperation): Promise<void>;
export function withOfflineEvidenceSyncLock<T>(projectId: string, task: (lease: OfflineEvidenceSyncLeaseContext) => Promise<T> | T): Promise<T>;
export function orderOfflineEvidenceOperation(existingOperations: OfflineEvidenceOperation[], operation: OfflineEvidenceOperation): OfflineEvidenceOperation;

export function rebaseOfflineEvidenceUpdateOperation(operation: OfflineEvidenceOperation, latestRevisionVersion: number): OfflineEvidenceOperation;

export interface OfflineEvidenceSyncLeaseContext {
  fencingToken: number;
  assertLease(): Promise<number>;
  acknowledge(operation: OfflineEvidenceOperation): Promise<boolean>;
  recordFailure(operation: OfflineEvidenceOperation, replacement: OfflineEvidenceOperation): Promise<boolean>;
}
export function transitionOfflineEvidenceLease(current: { name?: string; owner: string | null; leaseUntil: number; fencingToken: number } | null, owner: string, now: number, leaseMs: number, options?: { release?: boolean; fencingToken?: number }): { acquired: boolean; lease: { name?: string; owner: string | null; leaseUntil: number; fencingToken: number } | null };
