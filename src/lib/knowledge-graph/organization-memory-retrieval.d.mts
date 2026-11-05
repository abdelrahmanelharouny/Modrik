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

export interface OrganizationMemoryScanResult<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate> {
  rows: T[];
  pages: number;
  batchSize: number;
  candidatesScanned: number;
}
export function scanOrganizationMemoryCandidates<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate>(input: {
  where: Record<string, unknown>;
  findMany: (args: Record<string, unknown>) => Promise<T[]>;
  include?: Record<string, unknown>;
  batchSize?: number;
}): Promise<OrganizationMemoryScanResult<T>>;
