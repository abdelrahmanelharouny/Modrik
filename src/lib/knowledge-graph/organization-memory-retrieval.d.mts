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

export interface OrganizationMemoryStreamingScanResult<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate> {
  rows: Array<T & { retrieval: { mode: "lexical"; score: number } }>;
  candidatesScanned: number;
  rankingCandidatesScanned: number;
  pages: number;
  batchSize: number;
  passes: 2;
  snapshotAt: string;
}
export function rankOrganizationMemoryCandidatesStream<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate>(input: {
  where: Record<string, any>;
  projectIds: string[];
  query: string;
  limit?: number;
  batchSize?: number;
  snapshotAt?: Date;
  withProject?: boolean;
  findMany: (args: Record<string, unknown>) => Promise<T[]>;
}): Promise<OrganizationMemoryStreamingScanResult<T>>;
