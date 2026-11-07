export const CHANGE_COST_MODEL_VERSION = "change-cost-v2";

export function summarizeChangeCostCalibration(records) {
  const paired = records
    .filter((record) => record?.estimate && record?.outcome)
    .map((record) => ({
      points: Number(record.estimate.effortPoints),
      hours: Number(record.outcome.actualHours),
    }))
    .filter((row) => Number.isFinite(row.points) && row.points > 0 && Number.isFinite(row.hours) && row.hours >= 0);
  const n = paired.length;
  if (!n) return { sampleCount: 0, modelVersion: CHANGE_COST_MODEL_VERSION, fit: null, maeHours: null, rmseHours: null, meanBiasHours: null, rankCorrelation: null, readiness: "no_observations" };
  const meanX = paired.reduce((sum, row) => sum + row.points, 0) / n;
  const meanY = paired.reduce((sum, row) => sum + row.hours, 0) / n;
  const varianceX = paired.reduce((sum, row) => sum + (row.points - meanX) ** 2, 0);
  const covariance = paired.reduce((sum, row) => sum + (row.points - meanX) * (row.hours - meanY), 0);
  const slope = varianceX > 0 ? covariance / varianceX : null;
  const intercept = slope === null ? null : meanY - slope * meanX;
  const errors = slope === null ? [] : paired.map((row) => row.hours - (intercept + slope * row.points));
  const maeHours = errors.length ? errors.reduce((sum, error) => sum + Math.abs(error), 0) / n : null;
  const rmseHours = errors.length ? Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / n) : null;
  const meanBiasHours = errors.length ? errors.reduce((sum, error) => sum + error, 0) / n : null;
  const rankCorrelation = spearman(paired.map((row) => row.points), paired.map((row) => row.hours));
  return {
    sampleCount: n, modelVersion: CHANGE_COST_MODEL_VERSION,
    fit: slope === null ? null : { intercept: round(intercept), hoursPerEffortPoint: round(slope) },
    maeHours: maeHours === null ? null : round(maeHours),
    rmseHours: rmseHours === null ? null : round(rmseHours),
    meanBiasHours: meanBiasHours === null ? null : round(meanBiasHours),
    rankCorrelation: rankCorrelation === null ? null : round(rankCorrelation),
    readiness: n < 10 ? "collecting" : n < 30 ? "early_signal" : "review_candidate",
    caveat: "Descriptive in-sample fit only. It is not a validated forecast; use a held-out, representative project sample before operational decisions.",
  };
}

function round(value) { return Math.round(value * 1000) / 1000; }
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
