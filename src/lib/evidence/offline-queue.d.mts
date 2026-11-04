export interface OfflineEvidencePayload {
  title: string; sourceType: string; language: string; content: string; consent: boolean;
}
export interface OfflineEvidenceOperation {
  operationId: string; projectId: string; payload: OfflineEvidencePayload;
  createdAt: string; attempts: number; lastError?: string;
}
export function createOfflineEvidenceOperation(projectId: string, payload: OfflineEvidencePayload, operationId?: string): OfflineEvidenceOperation;
export function putOfflineEvidenceOperation(operation: OfflineEvidenceOperation): Promise<void>;
export function listOfflineEvidenceOperations(projectId: string): Promise<OfflineEvidenceOperation[]>;
export function removeOfflineEvidenceOperation(operationId: string): Promise<void>;
export function updateOfflineEvidenceOperation(operation: OfflineEvidenceOperation): Promise<void>;
export function withOfflineEvidenceSyncLock<T>(projectId: string, task: () => Promise<T> | T): Promise<T>;

export function orderOfflineEvidenceOperation(existingOperations: OfflineEvidenceOperation[], operation: OfflineEvidenceOperation): OfflineEvidenceOperation;
