import test from "node:test";
import assert from "node:assert/strict";
import { assessArabicTranscriptQuality } from "../src/lib/asr/arabic-transcript-quality.mjs";

test("Egyptian Arabic transcript returns weak lexical cues without asserting accuracy", () => {
  const result = assessArabicTranscriptQuality({ text: "ازيك، احنا عايزين نعمل ده دلوقتي ومفيش مشكلة", expectedLanguage: "ar-EG" });
  assert.equal(result.reviewRequired, false);
  assert.ok(result.arabicLetterRatio > 0.9);
  assert.ok(result.dialectCueMatches.includes("احنا"));
  assert.equal(result.dialectSignals, "egyptian_cues_observed");
  assert.match(result.caveat, /do not estimate word error rate/i);
});
test("wrong script, short and repetitive transcripts require human review", () => {
  assert.ok(assessArabicTranscriptQuality({ text: "hello world today", expectedLanguage: "ar-EG" }).reviewReasons.includes("expected_language_script_mismatch"));
  assert.ok(assessArabicTranscriptQuality({ text: "تمام", expectedLanguage: "ar-EG" }).reviewReasons.includes("transcript_too_short"));
  assert.ok(assessArabicTranscriptQuality({ text: "لا لا لا لا لا لا لا لا لا", expectedLanguage: "ar-EG" }).reviewReasons.includes("high_token_repetition"));
});
test("code-switched transcript is reported without forcing a single language", () => {
  const result = assessArabicTranscriptQuality({ text: "احنا محتاجين export للreport بكرة", expectedLanguage: "codeswitch" });
  assert.equal(result.mixedScript, true); assert.equal(result.reviewRequired, false);
});
