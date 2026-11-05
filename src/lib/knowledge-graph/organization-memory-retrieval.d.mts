export interface OrganizationMemoryCandidate {
  id: string;
  projectId: string;
  status: string;
  kind: string;
  label: string;
  description?: string | null;
  [key: string]: unknown;
}
export function normalizeOrganizationMemoryText(value: unknown): string;
export function tokenizeOrganizationMemoryText(value: unknown): string[];
export function rankOrganizationMemoryCandidates(input?: {
  projectIds?: string[];
  candidates?: OrganizationMemoryCandidate[];
  query?: string;
  mode?: "lexical" | "semantic" | "hybrid";
  semanticScores?: Array<{ id: string; score: number }>;
  limit?: number;
}): Array<OrganizationMemoryCandidate & { retrieval: { mode: string; score: number } }>;
