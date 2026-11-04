import { createHash } from "node:crypto";

/** Fingerprint the full semantic identity of an idempotent evidence operation. */
export function hashEvidenceOperationRequest({ projectId, action, origin, normalized }) {
  if (typeof projectId !== "string" || !projectId) throw new TypeError("projectId is required");
  if (!["create", "update", "delete"].includes(action)) throw new TypeError("Unsupported evidence operation action");
  if (typeof normalized !== "object" || normalized === null || Array.isArray(normalized)) throw new TypeError("normalized payload is required");
  return createHash("sha256").update(JSON.stringify({ projectId, action, origin: origin ?? null, normalized })).digest("hex");
}
