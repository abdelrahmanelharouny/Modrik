import test from "node:test";
import assert from "node:assert/strict";
import { prepareAsrHumanCorrection, redactAsrTranscriptPii } from "../src/lib/asr/asr-human-correction.mjs";

test("ASR correction collection requires independent explicit consent and Arabic language scope", () => {
  assert.throws(() => prepareAsrHumanCorrection({ language: "ar-EG", originalTranscript: "نص صحيح", correctedTranscript: "نص مضبوط" }), /consent/);
  assert.throws(() => prepareAsrHumanCorrection({ consent: true, language: "en", originalTranscript: "source text", correctedTranscript: "fixed text" }), /Only Egyptian Arabic/);
});
test("correction pairs redact contact details and retain no audio", () => {
  const result = prepareAsrHumanCorrection({
    consent: true, language: "ar-EG",
    originalTranscript: "اتصل على 01012345678 أو test@example.com للتفاصيل",
    correctedTranscript: "اتصل على ٠١٠١٢٣٤٥٦٧٨ أو test@example.com للتفاصيل",
  });
  assert.doesNotMatch(result.originalTranscript, /01012345678|test@example.com/);
  assert.doesNotMatch(result.correctedTranscript, /01012345678|test@example.com/);
  assert.equal(result.audioStored, false);
  assert.ok(result.redactions.original.emailCount + result.redactions.original.egyptianMobileCount > 0);
});
test("text payload lengths are bounded before persistence", () => {
  assert.throws(() => prepareAsrHumanCorrection({ consent: true, language: "codeswitch", originalTranscript: "x".repeat(5001), correctedTranscript: "some words" }), /4–5,000/);
  assert.equal(redactAsrTranscriptPii("").text, "");
});
