export interface OfflineEvidenceRetryScheduler {
  isPending(): boolean;
  schedule(delayMs: number, callback: () => void): boolean;
  cancel(): boolean;
}
export function createOfflineEvidenceRetryScheduler(options?: {
  setTimeoutFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}): OfflineEvidenceRetryScheduler;
