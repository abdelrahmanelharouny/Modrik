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
  firstPassPages: number;
  secondPassPages: number;
  batchSize: number;
  passes: 2;
  retrievalMode: "streaming_bm25_keyset";
  snapshotAt: string;
  durationMs: number;
}
export function rankOrganizationMemoryCandidatesStream<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate>(input: {
  where: Record<string, unknown>;
  projectIds: string[];
  query: string;
  limit?: number;
  batchSize?: number;
  snapshotAt?: Date;
  withProject?: boolean;
  findMany: (args: Record<string, unknown>) => Promise<T[]>;
}): Promise<OrganizationMemoryStreamingScanResult<T>>;


export interface OrganizationMemoryIndexedScanResult<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate> {
  rows: Array<T & { retrieval: { mode: "indexed_bm25"; score: number } }>;
  candidatesScanned: number;
  rankingCandidatesScanned: number;
  postingsScanned: number;
  pages: number;
  firstPassPages: number;
  secondPassPages: number;
  passes: 2;
  batchSize: number;
  retrievalMode: "persistent_inverted_index";
  documentCount?: number;
  averageLength?: number;
  snapshotAt: string;
  durationMs: number;
}
export function rankOrganizationMemoryCandidatesIndexed<T extends OrganizationMemoryCandidate = OrganizationMemoryCandidate>(input: {
  projectIds: string[];
  query: string;
  limit?: number;
  batchSize?: number;
  snapshotAt?: Date;
  normalizerVersion?: number;
  aggregateDocuments: (args: Record<string, unknown>) => Promise<{ _count?: { _all?: number }; _sum?: { tokenCount?: number | null } }>;
  findPostings: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  findCandidates: (args: Record<string, unknown>) => Promise<T[]>;
}): Promise<OrganizationMemoryIndexedScanResult<T>>;

export function compareOrganizationMemoryRetrievalParity(
  referenceRows: Array<{ id: string; retrieval?: { score?: number } }>,
  indexedRows: Array<{ id: string; retrieval?: { score?: number } }>,
): {
  referenceCount: number;
  indexedCount: number;
  overlapCount: number;
  topKRecall: number;
  exactRankMatch: boolean;
  comparedScores: number;
  maxAbsoluteScoreDelta: number;
};
