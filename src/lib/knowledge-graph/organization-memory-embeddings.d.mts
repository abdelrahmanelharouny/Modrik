export interface OrganizationMemoryEmbeddingVector {
  model: string;
  dimensions: number;
  vector: number[];
  norm?: number;
}
export function buildOrganizationMemoryEmbeddingContent(node: { label: string; kind: string; description?: string | null }): {
  content: string; contentHash: string; normalizerVersion: number;
};
export function validateOrganizationMemoryVector(input: OrganizationMemoryEmbeddingVector, expected?: { model?: string; dimensions?: number }): Required<OrganizationMemoryEmbeddingVector>;
export function buildOrganizationMemoryEmbeddingIdentity(input: {
  organizationId: string; projectId: string; nodeId: string; contentHash: string; model: string; dimensions: number;
}): { organizationId: string; projectId: string; nodeId: string; contentHash: string; model: string; dimensions: number };
export function buildOrganizationMemoryEmbeddingWork(input: {
  organizationId: string; model: string; dimensions: number;
  node: { id: string; projectId: string; status: string; label: string; kind: string; description?: string | null };
}): ({ operation: "delete"; organizationId: string; projectId: string; nodeId: string; reason: string } | {
  operation: "upsert"; organizationId: string; projectId: string; nodeId: string; content: string; contentHash: string;
  normalizerVersion: number; model: string; dimensions: number; idempotencyKey: string;
});
export function rankTenantScopedOrganizationMemoryEmbeddings<T extends {
  id: string; projectId: string; organizationId: string; status: string; contentHash: string;
}>(input: {
  organizationId: string; projectIds: string[]; model: string; dimensions: number; limit?: number;
  queryEmbedding: OrganizationMemoryEmbeddingVector; candidates: T[];
  embeddingRecords: Array<OrganizationMemoryEmbeddingVector & {
    organizationId: string; projectId: string; nodeId: string; status: string; contentHash: string;
  }>;
}): Array<T & { retrieval: { mode: "semantic"; score: number } }>;
export function buildTenantScopedEmbeddingFilter(input: {
  organizationId: string; projectIds: string[]; model: string; dimensions: number;
}): null | { organizationId: string; projectId: { in: string[] }; model: string; dimensions: number; status: "ready" };
