export const KNOWLEDGE_NODE_KINDS: readonly string[];
export const KNOWLEDGE_NODE_STATUSES: readonly string[];
export const KNOWLEDGE_RELATION_TYPES: readonly string[];
export const KNOWLEDGE_EDGE_STATUSES: readonly string[];
export const CLAIM_NODE_RELATIONSHIPS: readonly string[];
export const NODE_REQUIREMENT_ROLES: readonly string[];

export interface NormalizedKnowledgeNodeInput {
  kind: string;
  label: string;
  description: string;
  confidence: number;
  attributes: string;
  owner: string | null;
}

export interface NormalizedKnowledgeEdgeInput {
  relationType: string;
  confidence: number;
  note: string;
}

export function normalizeNodeInput(input: unknown): NormalizedKnowledgeNodeInput;
export function normalizeEdgeInput(input: unknown): NormalizedKnowledgeEdgeInput;
export function parseNodeAttributes(value: unknown): Record<string, unknown>;
export function validateNodeStatus(status: unknown): boolean;
