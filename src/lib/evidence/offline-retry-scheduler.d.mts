export interface OfflineEvidenceRetryScheduler {
  isPending(): boolean;
  schedule(delayMs: number, callback: () => void): boolean;
  cancel(): boolean;
}
export function createOfflineEvidenceRetryScheduler(options?: {
  setTimeoutFn?: (callback: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (handle: unknown) => void;
}): OfflineEvidenceRetryScheduler;
