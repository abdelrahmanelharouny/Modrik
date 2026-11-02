const BIN_EDGES = [
  { low: 0, high: 40, label: "0–39" },
  { low: 40, high: 60, label: "40–59" },
  { low: 60, high: 80, label: "60–79" },
  { low: 80, high: 101, label: "80–100" },
];

export function calculateHumanCalibration(requirements) {
  const rows = (Array.isArray(requirements) ? requirements : []).filter((requirement) =>
    requirement?.verificationSource === "human" &&
    Number.isInteger(requirement.confidence) &&
    requirement.confidence >= 0 && requirement.confidence <= 100 &&
    ["supported", "weak"].includes(requirement.verifyStatus)
  );
  const n = rows.length;
  if (n < 3) {
    return {
      n,
      brier: null,
      ece: null,
      verdict: "insufficient-data",
      bins: [],
      spread: { supportedAvg: null, weakAvg: null },
    };
  }

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
    return {
      range: label,
      low,
      high: high === 101 ? 100 : high,
      n: records.length,
      avgConfidence: Math.round(avgConfidence),
      empirical: +empirical.toFixed(3),
      delta: +(avgConfidence / 100 - empirical).toFixed(3),
    };
  }).filter(Boolean);

  const ece = bins.reduce((sum, bin) =>
    sum + (bin.n / n) * Math.abs(bin.delta), 0
  );
  const supported = rows.filter((row) => row.verifyStatus === "supported");
  const weak = rows.filter((row) => row.verifyStatus === "weak");
  const average = (records) => records.length
    ? Math.round(records.reduce((sum, row) => sum + row.confidence, 0) / records.length)
    : null;
  const netDelta = bins.reduce((sum, bin) => sum + bin.delta * bin.n, 0) / n;
  const verdict = ece <= 0.1
    ? "well-calibrated"
    : netDelta > 0.05
      ? "overconfident"
      : netDelta < -0.05
        ? "underconfident"
        : "mixed-calibration";

  return {
    n,
    brier: +brier.toFixed(4),
    ece: +ece.toFixed(4),
    verdict,
    bins,
    spread: { supportedAvg: average(supported), weakAvg: average(weak) },
  };
}
