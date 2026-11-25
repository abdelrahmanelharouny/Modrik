import test from "node:test";
import assert from "node:assert/strict";
import { createPlannerHumanReviewPacket, validatePlannerHumanRatings, analyzePlannerHumanRatings, PLANNER_HUMAN_DIMENSIONS } from "../src/lib/research/planner-human-feedback.mjs";

const arms = ["single_shot", "random", "llm", "impact_aware"];
const runs = arms.map((arm) => ({ experimentId: "exp-1", arm, questions: JSON.stringify([{ text: "ازاي المستخدم هيعمل تسجيل الدخول؟", language: "ar-EG", priority: "high", utility: { utility: 999 } }]) }));
const scores = (offset = 0) => Object.fromEntries(PLANNER_HUMAN_DIMENSIONS.map((key) => [key, Math.min(5, 3 + offset)]));

test("planner human packet blinds arm labels and strips utility metadata", () => {
  const { packet, answerKey } = createPlannerHumanReviewPacket(runs, { packetId: "packet-1", seed: "fixed" });
  assert.equal(packet.sets.length, 4);
  assert.deepEqual(packet.sets.map((row) => row.blindId), ["A", "B", "C", "D"]);
  assert.equal(Object.values(answerKey).sort().join(","), [...arms].sort().join(","));
  assert.equal(JSON.stringify(packet).includes("impact_aware"), false);
  assert.equal(JSON.stringify(packet).includes("utility"), false);
  assert.deepEqual(createPlannerHumanReviewPacket(runs, { packetId: "packet-1", seed: "fixed" }).packet, packet);
});
test("packet rejects missing, duplicate and cross-experiment planner arms", () => {
  assert.throws(() => createPlannerHumanReviewPacket(runs.slice(0, 3)), /four-arm/);
  assert.throws(() => createPlannerHumanReviewPacket([{ ...runs[0], experimentId: "other" }, ...runs.slice(1)]), /share one experiment/);
});
test("ratings require every blinded set and every ordinal rubric score", () => {
  const { packet } = createPlannerHumanReviewPacket(runs);
  const valid = packet.sets.map((set) => ({ blindId: set.blindId, scores: scores(), notes: "" }));
  assert.equal(validatePlannerHumanRatings(packet, valid).length, 4);
  assert.throws(() => validatePlannerHumanRatings(packet, valid.slice(1)), /Every blinded/);
  assert.throws(() => validatePlannerHumanRatings(packet, valid.map((row, i) => i ? row : { ...row, scores: { ...row.scores, grounding: 6 } })), /integers from 1 to 5/);
  assert.throws(() => validatePlannerHumanRatings(packet, [valid[0], valid[0], ...valid.slice(2)]), /duplicate/);
});
test("analysis requires two complete raters and reports descriptive arm metrics", () => {
  const { packet, answerKey } = createPlannerHumanReviewPacket(runs, { packetId: "packet" });
  const make = (offset) => ({ ratings: packet.sets.map(set => ({ blindId: set.blindId, scores: scores(offset), notes: "" })) });
  const report = analyzePlannerHumanRatings(packet, answerKey, [make(0), make(1)]);
  assert.equal(report.reviewerCount, 2); assert.equal(report.setCount, 4);
  assert.equal(report.inference, "descriptive-only"); assert.equal(Object.keys(report.byArm).length, 4);
  assert.throws(() => analyzePlannerHumanRatings(packet, answerKey, [make(0)]), /Exactly two/);
});
