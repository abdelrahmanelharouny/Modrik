export function enqueueOrganizationMemoryEmbeddingWork(
  tx: { organizationMemoryEmbeddingJob: { upsert(args: Record<string, unknown>): Promise<unknown> } },
  input: {
    enabled?: boolean; organizationId?: string | null; model?: string; dimensions?: number;
    node: { id: string; projectId: string; status: string; label: string; kind: string; description?: string | null; updatedAt?: Date | string };
  },
): Promise<{ queued: false; reason: string } | { queued: true; operation: "upsert" | "delete"; idempotencyKey: string }>;
