import { createHash } from "node:crypto";

export const PLANNER_HUMAN_RUBRIC_VERSION = "modrik-planner-human-v1";
export const PLANNER_HUMAN_DIMENSIONS = Object.freeze([
  "coverage", "grounding", "relevance", "specificity", "dialectFit", "nonRedundancy", "overall", "confidence",
]);
const ARMS = ["single_shot", "random", "llm", "impact_aware"];
const LABELS = ["A", "B", "C", "D"];

function digest(value) { return createHash("sha256").update(String(value)).digest("hex"); }
function parseQuestions(value) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { throw new TypeError("Planner question payload is not valid JSON."); }
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 30) throw new RangeError("Each planner arm must contain 1–30 questions.");
  return parsed.map((item) => {
    const text = typeof item?.text === "string" ? item.text.trim().slice(0, 600) : "";
    if (!text) throw new TypeError("Planner question text is required.");
    return {
      text,
      language: ["ar-EG", "codeswitch", "en"].includes(item.language) ? item.language : "unspecified",
      priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "unspecified",
    };
  });
}
function seededOrder(values, seed) {
  const remaining = [...values], ordered = [];
  let state = Number.parseInt(digest(seed).slice(0, 8), 16) || 1;
  while (remaining.length) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    ordered.push(remaining.splice((state >>> 0) % remaining.length, 1)[0]);
  }
  return ordered;
}

/** Create a blinded packet; the arm mapping is returned separately as a coordinator-only key. */
export function createPlannerHumanReviewPacket(runs, options = {}) {
  if (!Array.isArray(runs) || runs.length !== 4) throw new RangeError("A complete four-arm planner experiment is required.");
  const experimentIds = new Set(runs.map((row) => row?.experimentId).filter(Boolean));
  if (experimentIds.size !== 1 || !runs[0]?.experimentId) throw new TypeError("All four planner arms must share one experiment ID.");
  const byArm = new Map();
  for (const row of runs) {
    if (!ARMS.includes(row?.arm) || byArm.has(row.arm)) throw new TypeError("Planner experiment has an unknown or duplicate arm.");
    byArm.set(row.arm, row);
  }
  if (ARMS.some((arm) => !byArm.has(arm))) throw new TypeError("Planner experiment is missing an arm.");
  const experimentId = runs[0].experimentId;
  const packetId = typeof options.packetId === "string" && options.packetId.trim() ? options.packetId.trim() : digest(experimentId + ":packet").slice(0, 24);
  const seed = typeof options.seed === "string" && options.seed.trim() ? options.seed.trim() : packetId;
  const answerKey = {};
  const sets = seededOrder(ARMS, seed).map((arm, index) => {
    const blindId = LABELS[index];
    answerKey[blindId] = arm;
    return { blindId, questions: parseQuestions(byArm.get(arm).questions) };
  });
  const brief = typeof options.brief === "string" ? options.brief.trim().slice(0, 5000) : "";
  const evidence = (Array.isArray(options.evidence) ? options.evidence : [])
    .filter((item) => item && item.consent === true && typeof item.content === "string")
    .slice(0, 8)
    .map((item) => ({
      title: String(item.title ?? "Consented evidence").slice(0, 160),
      language: ["ar-EG", "codeswitch", "en"].includes(item.language) ? item.language : "unspecified",
      content: item.content.slice(0, 1500),
    }));
  const packet = {
    packetId, schemaVersion: 1, rubricVersion: PLANNER_HUMAN_RUBRIC_VERSION, experimentId,
    context: { brief, evidence }, sets, dimensions: PLANNER_HUMAN_DIMENSIONS,
    blinding: "Arm names, model/provider, utility values, gold labels and candidate-pool metadata are withheld from raters.",
  };
  return { packet, answerKey, packetSha256: digest(JSON.stringify(packet)) };
}

/** Validate a complete, bounded 1–5 ordinal rating sheet. */
export function validatePlannerHumanRatings(packet, ratings) {
  if (!packet || !Array.isArray(packet.sets) || !Array.isArray(ratings)) throw new TypeError("A valid packet and rating array are required.");
  if (ratings.length !== packet.sets.length) throw new RangeError("Every blinded question set must be rated exactly once.");
  const expected = new Set(packet.sets.map((set) => set.blindId)), seen = new Set();
  return ratings.map((row) => {
    if (!row || typeof row !== "object" || !expected.has(row.blindId) || seen.has(row.blindId)) throw new TypeError("Unknown or duplicate blinded set.");
    seen.add(row.blindId);
    const score = {};
    for (const dimension of PLANNER_HUMAN_DIMENSIONS) {
      const value = row.scores?.[dimension];
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new RangeError("All rubric scores must be integers from 1 to 5.");
      score[dimension] = value;
    }
    const notes = typeof row.notes === "string" ? row.notes.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 1000) : "";
    return { blindId: row.blindId, scores: score, notes };
  });
}

function weightedKappa(left, right) {
  const n = Math.min(left.length, right.length);
  if (n < 2) return null;
  const observed = Array.from({ length: 5 }, () => Array(5).fill(0));
  const leftMarginal = Array(5).fill(0), rightMarginal = Array(5).fill(0);
  for (let i = 0; i < n; i++) {
    const a = left[i] - 1, b = right[i] - 1;
    observed[a][b] += 1; leftMarginal[a] += 1; rightMarginal[b] += 1;
  }
  let observedDisagreement = 0, expectedDisagreement = 0;
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    const weight = ((a - b) / 4) ** 2;
    observedDisagreement += weight * observed[a][b] / n;
    expectedDisagreement += weight * (leftMarginal[a] / n) * (rightMarginal[b] / n);
  }
  return expectedDisagreement === 0 ? null : 1 - observedDisagreement / expectedDisagreement;
}

/** Compare two independent raters; scores remain descriptive for this experiment. */
export function analyzePlannerHumanRatings(packet, answerKey, reviews) {
  if (!packet?.sets || !answerKey || !Array.isArray(reviews) || reviews.length !== 2) {
    throw new RangeError("Exactly two independent reviewer sheets are required for analysis.");
  }
  const byReviewer = reviews.map((review) => new Map(validatePlannerHumanRatings(packet, review.ratings).map((row) => [row.blindId, row])));
  const interRater = {};
  for (const dimension of PLANNER_HUMAN_DIMENSIONS) {
    const left = packet.sets.map((set) => byReviewer[0].get(set.blindId).scores[dimension]);
    const right = packet.sets.map((set) => byReviewer[1].get(set.blindId).scores[dimension]);
    const exact = left.filter((value, index) => value === right[index]).length;
    const withinOne = left.filter((value, index) => Math.abs(value - right[index]) <= 1).length;
    interRater[dimension] = {
      n: left.length, weightedKappa: left.length >= 10 ? weightedKappa(left, right) : null, reliabilityStatus: left.length >= 10 ? "descriptive-agreement-estimate" : "insufficient-independent-items", exactAgreement: exact / left.length,
      withinOneAgreement: withinOne / left.length,
      meanAbsoluteDifference: left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length,
    };
  }
  const byArm = {};
  for (const set of packet.sets) {
    const arm = answerKey[set.blindId];
    if (!ARMS.includes(arm)) throw new Error("Coordinator key contains an invalid arm mapping.");
    const rows = [byReviewer[0].get(set.blindId), byReviewer[1].get(set.blindId)];
    byArm[arm] = Object.fromEntries(PLANNER_HUMAN_DIMENSIONS.map((dimension) => [
      dimension, Number((rows.reduce((sum, row) => sum + row.scores[dimension], 0) / rows.length).toFixed(3)),
    ]));
  }
  return {
    packetId: packet.packetId, experimentId: packet.experimentId, rubricVersion: packet.rubricVersion,
    reviewerCount: reviews.length, setCount: packet.sets.length, interRater, byArm,
    inference: "descriptive-only",
    limitation: "One four-arm experiment is not an independent scenario sample. Do not infer planner superiority or report significance from these four ratings.",
  };
}
