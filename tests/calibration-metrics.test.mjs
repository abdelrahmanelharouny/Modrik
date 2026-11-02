import test from "node:test";
import assert from "node:assert/strict";
import { calculateHumanCalibration } from "../src/lib/calibration/metrics.mjs";

test("calibration does not treat AI verifier outputs as independent ground truth", () => {
  const result = calculateHumanCalibration([
    { confidence: 90, verifyStatus: "supported", verificationSource: "agent" },
    { confidence: 20, verifyStatus: "weak", verificationSource: "agent" },
  ]);
  assert.equal(result.n, 0);
  assert.equal(result.brier, null);
  assert.equal(result.ece, null);
  assert.equal(result.verdict, "insufficient-data");
});

test("calibration requires at least three explicit human labels", () => {
  const result = calculateHumanCalibration([
    { confidence: 90, verifyStatus: "supported", verificationSource: "human" },
    { confidence: 20, verifyStatus: "weak", verificationSource: "human" },
  ]);
  assert.equal(result.n, 2);
  assert.equal(result.brier, null);
  assert.equal(result.ece, null);
});

test("100 percent confidence is assigned to the final calibration bin", () => {
  const result = calculateHumanCalibration([
    { confidence: 100, verifyStatus: "supported", verificationSource: "human" },
    { confidence: 100, verifyStatus: "supported", verificationSource: "human" },
    { confidence: 100, verifyStatus: "supported", verificationSource: "human" },
  ]);
  assert.equal(result.n, 3);
  assert.equal(result.bins.length, 1);
  assert.equal(result.bins[0].range, "80–100");
  assert.equal(result.bins[0].n, 3);
  assert.equal(result.brier, 0);
  assert.equal(result.ece, 0);
});

test("human labels produce deterministic Brier score and ECE", () => {
  const result = calculateHumanCalibration([
    { confidence: 90, verifyStatus: "supported", verificationSource: "human" },
    { confidence: 80, verifyStatus: "supported", verificationSource: "human" },
    { confidence: 20, verifyStatus: "weak", verificationSource: "human" },
  ]);
  assert.equal(result.n, 3);
  assert.equal(result.verdict, "well-calibrated");
  assert.equal(result.spread.supportedAvg, 85);
  assert.equal(result.spread.weakAvg, 20);
});
