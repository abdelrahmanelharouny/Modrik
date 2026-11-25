import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAsrEvaluationText, evaluateAsrTranscriptPair, evaluateAsrTranscriptCorpus } from "../src/lib/asr/evaluation.mjs";

test("Arabic normalization removes diacritics, standardizes common letter variants and punctuation", () => {
  assert.equal(normalizeAsrEvaluationText("إِنَّهُ عايزٌ، يِمشي!"), "انه عايز يمشي");
  assert.equal(normalizeAsrEvaluationText("إلى مسؤول عن الشيء"), "الي مسوول عن الشي");
});
test("identical normalized reference and hypothesis have zero WER and CER", () => {
  const result = evaluateAsrTranscriptPair({ reference: "إحنا عايزين نراجع الـ API", hypothesis: "احنا عايزين نراجع ال API", language: "ar-EG" });
  assert.equal(result.wer, 0);
  assert.equal(result.cer, 0);
  assert.equal(result.language, "ar-EG");
});
test("WER/CER count substitutions, deletions and insertions against reference length", () => {
  const result = evaluateAsrTranscriptPair({ reference: "احنا بنراجع الكلام", hypothesis: "احنا نراجع الكلام جدا" });
  assert.equal(result.substitutions, 1);
  assert.equal(result.deletions, 0);
  assert.equal(result.insertions, 1);
  assert.equal(result.wer, 0.666667);
  assert.ok(result.cer >= 0);
});
test("corpus evaluator reports micro scores and language/provider slices", () => {
  const report = evaluateAsrTranscriptCorpus([
    { reference: "احنا بنراجع الكلام", hypothesis: "احنا بنراجع الكلام", language: "ar-EG", provider: "zai" },
    { reference: "we need the api", hypothesis: "we need api", language: "codeswitch", provider: "whisper" },
    { reference: "", hypothesis: "hallucinated", language: "ar-EG", provider: "zai" },
  ]);
  assert.equal(report.totalSamples, 3);
  assert.equal(report.excludedEmptyReferences, 1);
  assert.equal(report.overall.sampleCount, 2);
  assert.equal(report.byLanguage["ar-EG"].wer, 0);
  assert.equal(report.byLanguage.codeswitch.wer, 0.25);
  assert.equal(report.byProvider.whisper.sampleCount, 1);
});
test("empty reference metrics are null rather than an artificial perfect score", () => {
  const result = evaluateAsrTranscriptPair({ reference: "", hypothesis: "text" });
  assert.equal(result.wer, null);
  assert.equal(result.cer, null);
  assert.equal(result.emptyReference, true);
});
