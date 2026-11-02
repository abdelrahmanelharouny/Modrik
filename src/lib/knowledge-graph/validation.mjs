export const KNOWLEDGE_NODE_KINDS = [
  "stakeholder", "goal", "assumption", "constraint", "decision", "risk",
  "metric", "system", "domain_concept", "process", "policy",
];
export const KNOWLEDGE_NODE_STATUSES = ["proposed", "in_review", "accepted", "rejected", "archived"];
export const KNOWLEDGE_RELATION_TYPES = [
  "influences", "depends_on", "constrains", "contradicts", "mitigates",
  "implements", "affects", "informs", "owns", "part_of", "derived_from",
  "supersedes", "collaborates_with",
];
export const KNOWLEDGE_EDGE_STATUSES = ["proposed", "accepted", "rejected"];
export const CLAIM_NODE_RELATIONSHIPS = ["supports", "contradicts", "qualifies", "context"];
export const NODE_REQUIREMENT_ROLES = ["implements", "constrains", "mitigates", "affects", "informs", "validates"];

export function normalizeNodeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Node payload must be an object.");
  const kind = typeof input.kind === "string" ? input.kind : "";
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const confidence = input.confidence === undefined ? 0.5 : Number(input.confidence);
  if (!KNOWLEDGE_NODE_KINDS.includes(kind)) throw new Error("Unsupported knowledge node kind.");
  if (!label || label.length > 180) throw new Error("Node label is required and limited to 180 characters.");
  if (description.length > 5000) throw new Error("Node description is limited to 5,000 characters.");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Confidence must be between 0 and 1.");
  const attributes = input.attributes === undefined ? {} : input.attributes;
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) throw new Error("Node attributes must be an object.");
  const encoded = JSON.stringify(attributes);
  if (encoded.length > 4000) throw new Error("Node attributes are limited to 4,000 characters.");
  return { kind, label, description, confidence, attributes: encoded,
    owner: typeof input.owner === "string" ? input.owner.trim().slice(0, 160) || null : null };
}

export function normalizeEdgeInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Edge payload must be an object.");
  const relationType = typeof input.relationType === "string" ? input.relationType : "";
  const confidence = input.confidence === undefined ? 0.5 : Number(input.confidence);
  if (!KNOWLEDGE_RELATION_TYPES.includes(relationType)) throw new Error("Unsupported knowledge relationship type.");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Confidence must be between 0 and 1.");
  return { relationType, confidence, note: typeof input.note === "string" ? input.note.trim().slice(0, 500) : "" };
}

export function parseNodeAttributes(value) {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export function validateNodeStatus(status) {
  return KNOWLEDGE_NODE_STATUSES.includes(status);
}
