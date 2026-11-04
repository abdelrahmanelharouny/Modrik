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
