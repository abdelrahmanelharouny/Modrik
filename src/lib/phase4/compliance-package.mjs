import { createHash } from "node:crypto";
export function canonicalJson(value) {
  if (Array.isArray(value)) return "["+value.map(canonicalJson).join(",")+"]";
  if (value && typeof value === "object") {
    return "{"+Object.keys(value).sort().map(key => JSON.stringify(key)+":"+canonicalJson(value[key])).join(",")+"}";
  }
  return JSON.stringify(value);
}
export function buildCompliancePackage(payload, generatedAt = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Compliance package payload must be an object.");
  const body = { schemaVersion:"modrik.enterprise-compliance.v1", generatedAt:generatedAt.toISOString(), ...payload };
  const canonical = canonicalJson(body);
  const sha256 = createHash("sha256").update(canonical,"utf8").digest("hex");
  return { manifest:{ schemaVersion:body.schemaVersion, generatedAt:body.generatedAt, hashAlgorithm:"SHA-256", sha256 }, body };
}
