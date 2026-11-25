const BIN_EDGES = [
  { low: 0, high: 40, label: "0–39" },
  { low: 40, high: 60, label: "40–59" },
  { low: 60, high: 80, label: "60–79" },
  { low: 80, high: 101, label: "80–100" },
];

function eligibleRows(requirements) {
  return (Array.isArray(requirements) ? requirements : []).filter((row) =>
    row?.verificationSource === "human" &&
    row.verifiedAt != null &&
    Number.isFinite(new Date(row.verifiedAt).getTime()) &&
    Number.isInteger(row.confidence) && row.confidence >= 0 && row.confidence <= 100 &&
    ["supported", "weak"].includes(row.verifyStatus)
  );
}

function summarize(rows) {
  const n = rows.length;
  if (n < 3) return { n, brier: null, ece: null, verdict: "insufficient-data", bins: [], spread: { supportedAvg: null, weakAvg: null } };
  const brier = rows.reduce((sum, row) => {
    const confidence = row.confidence / 100;
    const outcome = row.verifyStatus === "supported" ? 1 : 0;
    return sum + (confidence - outcome) ** 2;
  }, 0) / n;
  const bins = BIN_EDGES.map(({ low, high, label }) => {
    const records = rows.filter((row) => row.confidence >= low && row.confidence < high);
    if (!records.length) return null;
    const avgConfidence = records.reduce((sum, row) => sum + row.confidence, 0) / records.length;
    const empirical = records.filter((row) => row.verifyStatus === "supported").length / records.length;
    return { range: label, low, high: high === 101 ? 100 : high, n: records.length,
      avgConfidence: Math.round(avgConfidence), empirical: +empirical.toFixed(3),
      delta: +(avgConfidence / 100 - empirical).toFixed(3) };
  }).filter(Boolean);
  const ece = bins.reduce((sum, bin) => sum + (bin.n / n) * Math.abs(bin.delta), 0);
  const supported = rows.filter((row) => row.verifyStatus === "supported");
  const weak = rows.filter((row) => row.verifyStatus === "weak");
  const average = (records) => records.length ? Math.round(records.reduce((sum, row) => sum + row.confidence, 0) / records.length) : null;
  const netDelta = bins.reduce((sum, bin) => sum + bin.delta * bin.n, 0) / n;
  const verdict = ece <= 0.1 ? "well-calibrated" : netDelta > 0.05 ? "overconfident" : netDelta < -0.05 ? "underconfident" : "mixed-calibration";
  return { n, brier: +brier.toFixed(4), ece: +ece.toFixed(4), verdict, bins,
    spread: { supportedAvg: average(supported), weakAvg: average(weak) } };
}

function groupedSummary(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([segment, group]) => {
    const result = summarize(group);
    return { segment, n: result.n, brier: result.brier, ece: result.ece, verdict: result.verdict };
  });
}
function isoWeek(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return value.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

export function calculateHumanCalibration(requirements) {
  const rows = eligibleRows(requirements);
  return {
    ...summarize(rows),
    byLanguage: groupedSummary(rows, (row) => typeof row.language === "string" && row.language ? row.language : "unspecified"),
    byType: groupedSummary(rows, (row) => typeof row.type === "string" && row.type ? row.type : "unspecified"),
    weekly: groupedSummary(rows, (row) => isoWeek(new Date(row.verifiedAt))),
    labelSource: "human-reviewed",
  };
}
