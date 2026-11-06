export function buildOrganizationMemoryEmbeddingClaimFilter(now?: Date): {
  OR: Array<Record<string, unknown>>;
};
export function buildOrganizationMemoryEmbeddingLease(input: {
  workerId: string; now?: Date | string | number; leaseMs?: number;
}): { status: "processing"; lockedAt: Date; lockedBy: string; leaseExpiresAt: Date };
export function buildOrganizationMemoryEmbeddingRetry(input: {
  attempts: number; maxAttempts?: number; now?: Date | string | number;
  baseDelayMs?: number; error?: string;
}): {
  status: "pending" | "dead"; attempts: number; availableAt: Date;
  lockedAt: null; lockedBy: null; lastError: string; delayMs: number;
};
export function buildOrganizationMemoryEmbeddingCompletion(input: {
  jobId: string; workerId: string; lockedAt: Date;
}): { where: Record<string, unknown>; data: Record<string, unknown> };
export function classifyOrganizationMemoryEmbeddingWork(input: {
  operation: "upsert" | "delete"; nodeId: string; contentHash?: string;
  currentContentHash?: string | null; currentNodeStatus?: string;
}): { action: "delete"; nodeId: string } | { action: "superseded"; reason: string } | { action: "embed"; contentHash: string };
