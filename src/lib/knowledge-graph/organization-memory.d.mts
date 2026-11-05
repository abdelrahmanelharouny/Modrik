export function buildOrganizationKnowledgeCandidateQuery(input?: {
  projectIds?: string[];
  kind?: string;
}): {
  where: Record<string, unknown>;
  take: number;
  orderBy: Array<Record<string, "desc" | "asc">>;
};
export function buildOrganizationKnowledgeQuery(input?: {
  projectIds?: string[];
  kind?: string;
  search?: string;
  limit?: number;
}): {
  where: Record<string, unknown>;
  take: number;
  orderBy: Array<Record<string, "desc" | "asc">>;
};
export function summarizeOrganizationKnowledgeNode(node: unknown): {
  id: string;
  projectId: string;
  projectName: string | null;
  nodeRef: string;
  kind: string;
  label: string;
  description: string;
  confidence: number | null;
  updatedAt: unknown;
} | null;

export function buildOrganizationReviewQueueQuery(input?: {
  projectIds?: string[];
  kind?: string;
  search?: string;
  limit?: number;
}): {
  where: Record<string, unknown>;
  take: number;
  orderBy: Array<Record<string, "desc" | "asc">>;
};
export function summarizeOrganizationReviewQueueNode(node: unknown): {
  id: string;
  projectId: string;
  projectName: string | null;
  nodeRef: string;
  kind: string;
  label: string;
  description: string;
  confidence: number | null;
  owner: string | null;
  origin: string;
  updatedAt: unknown;
} | null;

export function hasVerifiedOrganizationMemoryIdentity(identity: unknown): boolean;

export function buildOrganizationMemoryPage(input?: {
  limit?: number;
  cursor?: string;
}): {
  limit: number;
  take: number;
  cursor?: { id: string };
  skip?: number;
};
