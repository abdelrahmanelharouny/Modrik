export function isEvidenceRevisionVersionConflict(error) {
  if (!error || typeof error !== "object" || error.code !== "P2002") return false;

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    const fields = target.map((field) => String(field).toLowerCase());
    return fields.includes("evidenceid") && fields.includes("version");
  }
  if (typeof target === "string") {
    const normalized = target.toLowerCase();
    return normalized.includes("evidenceid") && normalized.includes("version");
  }
  return false;
}

export function parseExpectedRevisionVersion(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}
