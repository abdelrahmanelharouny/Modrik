export function createOrganizationMemoryEmbeddingProvider(options?: {
  env?: Record<string, string | undefined>;
  fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}): Promise<{
  model: string;
  dimensions: number;
  embed(text: string): Promise<{ model: string; dimensions: number; vector: number[]; norm: number }>;
}>;
