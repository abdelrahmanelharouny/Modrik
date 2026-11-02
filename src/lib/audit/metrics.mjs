export function auditDataAvailability(count, value, threshold, mode = "max") {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(value)) {
    return { status: "not-assessed", detail: "No runtime observations available." };
  }
  const ok = mode === "min" ? value >= threshold : value <= threshold;
  return {
    status: ok ? "pass" : "warn",
    detail: mode === "min"
      ? String(value) + " meets minimum " + String(threshold)
      : String(value) + " is within maximum " + String(threshold),
  };
}

export function auditConsentCoverage(total, consented) {
  if (!Number.isInteger(total) || total <= 0) {
    return { status: "not-assessed", ratio: null, detail: "No evidence records exist yet." };
  }
  const eligible = Math.max(0, Math.min(total, Number.isFinite(consented) ? consented : 0));
  const ratio = eligible / total;
  const excluded = total - eligible;
  return {
    status: excluded === 0 ? "pass" : "warn",
    ratio,
    detail: excluded === 0
      ? total + "/" + total + " evidence sources have explicit AI-processing permission; this is not a legal compliance finding."
      : excluded + " of " + total + " evidence source(s) lack explicit AI-processing permission and are excluded from model prompts.",
  };
}

export function auditCredentialEncryption(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: "not-assessed", total: 0, encrypted: 0, detail: "No stored integration credentials to assess." };
  }
  const encrypted = rows.filter((row) => row?.encrypted === true).length;
  const legacy = rows.length - encrypted;
  return {
    status: legacy === 0 ? "pass" : "warn",
    total: rows.length,
    encrypted,
    detail: legacy === 0
      ? encrypted + "/" + rows.length + " integration credential record(s) use authenticated encryption."
      : legacy + " legacy integration record(s) still contain plaintext credentials. Re-save each integration after setting MODRIK_ENCRYPTION_KEY.",
  };
}

export function auditSourceCheck(value, positiveDetail, negativeDetail, unavailableDetail = "Source-level verification data is unavailable.") {
  if (value === true) return { status: "pass", detail: positiveDetail };
  if (value === false) return { status: "warn", detail: negativeDetail };
  return { status: "not-assessed", detail: unavailableDetail };
}

export function nearestRankPercentile(values, percentile) {
  const clean = Array.isArray(values)
    ? values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
    : [];
  if (!clean.length) return null;
  const p = Math.max(0, Math.min(1, percentile));
  const index = Math.max(0, Math.ceil(p * clean.length) - 1);
  return clean[index];
}
