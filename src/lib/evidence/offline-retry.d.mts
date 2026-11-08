export function getOfflineEvidenceRetryDelay(attempts: number): number;
export function offlineEvidenceFailureRequiresReview(error: unknown): boolean;

export function shouldDeferOfflineEvidenceSync(retryPending: boolean, force?: boolean): boolean;
