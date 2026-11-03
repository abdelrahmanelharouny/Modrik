// Build an exact compare-and-swap predicate for an Evidence projection.
// Every mutable source field participates so stale PATCH/DELETE requests cannot
// overwrite or remove a newer source snapshot.
export function buildEvidenceSnapshotWhere(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new TypeError("An evidence snapshot is required");
  }
  const required = ["id", "projectId", "title", "sourceType", "language", "content", "consent", "origin"];
  for (const key of required) {
    if (!(key in evidence)) throw new TypeError(`Evidence snapshot is missing ${key}`);
  }
  return Object.fromEntries(required.map((key) => [key, evidence[key]]));
}
