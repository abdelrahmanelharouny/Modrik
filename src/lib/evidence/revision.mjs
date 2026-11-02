import { createHash } from "node:crypto";

export function hashEvidenceRevision(snapshot) {
  const canonical = {
    title: snapshot.title,
    content: snapshot.content,
    sourceType: snapshot.sourceType,
    language: snapshot.language,
    consent: snapshot.consent,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function sameEvidenceRevision(left, right) {
  return hashEvidenceRevision(left) === hashEvidenceRevision(right);
}
