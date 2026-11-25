export const CHANGE_COST_MODEL_VERSION = "change-cost-v3-temporal";
export const CHANGE_COST_TYPES = Object.freeze(["feature", "bugfix", "refactor", "migration", "infrastructure", "security", "other"]);

function fitLinear(rows) {
  if (rows.length < 2) return null;
  const n = rows.length;
  const meanX = rows.reduce((sum, row) => sum + row.points, 0) / n;
  const meanY = rows.reduce((sum, row) => sum + row.hours, 0) / n;
  const varianceX = rows.reduce((sum, row) => sum + (row.points - meanX) ** 2, 0);
  if (varianceX <= 0) return null;
  const covariance = rows.reduce((sum, row) => sum + (row.points - meanX) * (row.hours - meanY), 0);
  const slope = covariance / varianceX;
  if (!Number.isFinite(slope) || slope < 0) return null;
  return { intercept: meanY - slope * meanX, hoursPerEffortPoint: slope };
}
function errorMetrics(rows, fit) {
  if (!rows.length || !fit) return { maeHours: null, rmseHours: null, meanBiasHours: null };
  const errors = rows.map((row) => row.hours - (fit.intercept + fit.hoursPerEffortPoint * row.points));
  return {
    maeHours: round(errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length),
    rmseHours: round(Math.sqrt(errors.reduce((sum, value) => sum + value ** 2, 0) / errors.length)),
    meanBiasHours: round(errors.reduce((sum, value) => sum + value, 0) / errors.length),
  };
}
export function summarizeChangeCostCalibration(records) {
  const paired = records
    .filter((record) => record?.estimate && record?.outcome)
    .map((record, index) => ({
      points: Number(record.estimate.effortPoints),
      hours: Number(record.outcome.actualHours),
      changeType: CHANGE_COST_TYPES.includes(record.outcome.changeType) ? record.outcome.changeType : "other",
      recordedAt: Date.parse(record.outcome.recordedAt ?? record.createdAt ?? index),
      order: index,
    }))
    .filter((row) => Number.isFinite(row.points) && row.points > 0 && Number.isFinite(row.hours) && row.hours >= 0)
    .sort((a, b) => (Number.isFinite(a.recordedAt) ? a.recordedAt : a.order) - (Number.isFinite(b.recordedAt) ? b.recordedAt : b.order) || a.order - b.order);
  const n = paired.length;
  if (!n) return {
    sampleCount: 0, trainingSampleCount: 0, holdoutSampleCount: 0,
    modelVersion: CHANGE_COST_MODEL_VERSION, protocol: "temporal_holdout_v1",
    fit: null, maeHours: null, rmseHours: null, meanBiasHours: null,
    rankCorrelation: null, segments: [], readiness: "no_observations",
    caveat: "No paired observations exist. No fit or predictive claim is available.",
  };
  const holdoutCount = n >= 10 ? Math.max(2, Math.ceil(n * 0.2)) : 0;
  const training = holdoutCount ? paired.slice(0, n - holdoutCount) : paired;
  const holdout = holdoutCount ? paired.slice(n - holdoutCount) : [];
  const fit = fitLinear(training);
  const metrics = errorMetrics(holdout, fit);
  const segments = [...new Set(paired.map((row) => row.changeType))].sort().map((changeType) => {
    const rows = paired.filter((row) => row.changeType === changeType);
    return { changeType, sampleCount: rows.length, rankCorrelation: roundNullable(spearman(rows.map((row) => row.points), rows.map((row) => row.hours))) };
  });
  return {
    sampleCount: n, trainingSampleCount: training.length, holdoutSampleCount: holdout.length,
    modelVersion: CHANGE_COST_MODEL_VERSION, protocol: "temporal_holdout_v1",
    fit: fit ? { intercept: round(fit.intercept), hoursPerEffortPoint: round(fit.hoursPerEffortPoint) } : null,
    ...metrics,
    rankCorrelation: roundNullable(spearman(paired.map((row) => row.points), paired.map((row) => row.hours))),
    segments,
    readiness: n < 10 ? "collecting" : n < 30 ? "early_signal" : "review_candidate",
    caveat: holdoutCount
      ? "Absolute error and bias are measured only on the chronologically latest holdout records; the fit uses earlier records only. This temporal split is not a substitute for representative multi-project validation."
      : "Insufficient observations for a temporal holdout. Any fit is descriptive only and must not be used as an operational forecast.",
  };
}
function round(value) { return Math.round(value * 1000) / 1000; }
function roundNullable(value) { return value === null ? null : round(value); }
function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const output = Array(values.length);
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end].value === sorted[i].value) end += 1;
    const rank = (i + 1 + end) / 2;
    for (let j = i; j < end; j += 1) output[sorted[j].index] = rank;
    i = end;
  }
  return output;
}
function spearman(left, right) {
  if (left.length < 2) return null;
  const x = ranks(left), y = ranks(right);
  const mx = x.reduce((sum, value) => sum + value, 0) / x.length;
  const my = y.reduce((sum, value) => sum + value, 0) / y.length;
  const numerator = x.reduce((sum, value, index) => sum + (value - mx) * (y[index] - my), 0);
  const dx = Math.sqrt(x.reduce((sum, value) => sum + (value - mx) ** 2, 0));
  const dy = Math.sqrt(y.reduce((sum, value) => sum + (value - my) ** 2, 0));
  return dx && dy ? numerator / (dx * dy) : null;
}
