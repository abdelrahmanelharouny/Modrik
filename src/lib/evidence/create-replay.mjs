import { hashEvidenceRevision } from "./revision.mjs";

// An idempotent create replay must match the complete create semantics, not
// only the revision fields. In particular, origin changes provenance/trust.
export function isEvidenceCreateReplay(existing, { projectId, normalized, origin }) {
  if (!existing || typeof existing !== "object") return false;
  return existing.projectId === projectId
    && existing.origin === origin
    && hashEvidenceRevision(existing) === hashEvidenceRevision(normalized);
}
