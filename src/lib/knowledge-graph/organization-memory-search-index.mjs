import { createHash } from "node:crypto";
import {
  normalizeOrganizationMemoryText,
  tokenizeOrganizationMemoryText,
} from "./organization-memory-retrieval.mjs";

export const ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION = 1;

/**
 * Rebuild one node's portable inverted-index document and postings.
 * The caller MUST pass a Prisma transaction client and commit it together
 * with the authoritative KnowledgeNode mutation.
 */
export async function replaceOrganizationMemorySearchDocument(tx, node) {
  if (!tx || typeof tx !== "object" ||
      !tx.organizationMemorySearchDocument || !tx.organizationMemorySearchPosting) {
    throw new TypeError("A transaction client with organization-memory search models is required.");
  }
  if (!node || typeof node.id !== "string" || !node.id ||
      typeof node.projectId !== "string" || !node.projectId ||
      typeof node.status !== "string" || typeof node.label !== "string") {
    throw new TypeError("A persisted KnowledgeNode is required to update its search index.");
  }

  const sourceText = [node.label, node.description, node.kind].filter(Boolean).join(" ");
  const normalizedText = normalizeOrganizationMemoryText(sourceText);
  const tokens = tokenizeOrganizationMemoryText(sourceText);
  const frequencies = new Map();
  for (const term of tokens) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  const contentHash = createHash("sha256")
    .update(`${ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION}\0${node.projectId}\0${node.status}\0${normalizedText}`, "utf8")
    .digest("hex");

  const document = await tx.organizationMemorySearchDocument.upsert({
    where: { nodeId: node.id },
    create: {
      nodeId: node.id,
      projectId: node.projectId,
      status: node.status,
      normalizedText,
      tokenCount: tokens.length,
      contentHash,
      normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    },
    update: {
      projectId: node.projectId,
      status: node.status,
      normalizedText,
      tokenCount: tokens.length,
      contentHash,
      normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
    },
    select: { id: true },
  });

  await tx.organizationMemorySearchPosting.deleteMany({ where: { documentId: document.id } });
  if (frequencies.size) {
    await tx.organizationMemorySearchPosting.createMany({
      data: [...frequencies].map(([term, frequency]) => ({
        documentId: document.id,
        term,
        frequency,
      })),
    });
  }
  return {
    documentId: document.id,
    tokenCount: tokens.length,
    uniqueTerms: frequencies.size,
    contentHash,
    normalizerVersion: ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION,
  };
}

/** Reconcile a source node with its index document without mutating either. */
export function compareOrganizationMemorySearchDocument(node, document) {
  if (!node || !document) return { matches: false, reason: "missing" };
  const sourceText = [node.label, node.description, node.kind].filter(Boolean).join(" ");
  const normalizedText = normalizeOrganizationMemoryText(sourceText);
  const tokens = tokenizeOrganizationMemoryText(sourceText);
  const expectedHash = createHash("sha256")
    .update(`${ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION}\0${node.projectId}\0${node.status}\0${normalizedText}`, "utf8")
    .digest("hex");
  const matches = document.nodeId === node.id &&
    document.projectId === node.projectId &&
    document.status === node.status &&
    document.normalizedText === normalizedText &&
    document.tokenCount === tokens.length &&
    document.contentHash === expectedHash &&
    document.normalizerVersion === ORGANIZATION_MEMORY_SEARCH_NORMALIZER_VERSION;
  return { matches, reason: matches ? null : "stale_or_mismatched" };
}
