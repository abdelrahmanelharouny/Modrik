export function persistOrganizationMemoryEmbedding(
  tx: {
    project: { findFirst(args: Record<string, unknown>): Promise<unknown> };
    knowledgeNode: { findFirst(args: Record<string, unknown>): Promise<unknown> };
    organizationMemoryEmbedding: { upsert(args: Record<string, unknown>): Promise<unknown> };
  },
  input: {
    organizationId: string; projectId: string; nodeId: string; model: string; dimensions: number;
    contentHash: string; embedding: { model: string; dimensions: number; vector: number[] };
    embeddedAt?: Date;
  },
): Promise<{ persisted: false; reason: string } | { persisted: true; record: unknown }>;
export function deleteOrganizationMemoryEmbedding(
  tx: { organizationMemoryEmbedding: { deleteMany(args: Record<string, unknown>): Promise<{ count: number }> } },
  input: { organizationId: string; projectId: string; nodeId: string; model: string; dimensions: number },
): Promise<{ deleted: number }>;
