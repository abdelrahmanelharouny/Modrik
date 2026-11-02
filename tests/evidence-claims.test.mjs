import test from "node:test";
import assert from "node:assert/strict";
import { findExactQuoteSpans, normalizeClaimInput, validateClaimSpan } from "../src/lib/evidence/claims.mjs";

const content = "The portal must support Arabic. Users want status notifications.";
test("quote spans are exact and use UTF-16 offsets", () => {
  const quote = "must support Arabic", start = content.indexOf(quote);
  assert.equal(validateClaimSpan(content, quote, start, start + quote.length), true);
  assert.equal(validateClaimSpan(content, "must support English", start, start + 21), false);
});
test("findExactQuoteSpans returns every non-overlapping occurrence", () => {
  assert.deepEqual(findExactQuoteSpans("same quote; same quote", "same quote"), [{start:0,end:10},{start:12,end:22}]);
});
test("normalization rejects fabricated or mismatched offsets", () => {
  assert.throws(() => normalizeClaimInput({claimText:"Arabic support",quote:"invented quote",quoteStart:0,quoteEnd:13}, content), /offsets do not match/);
});
test("normalization preserves exact quote and validates claim metadata", () => {
  const quote = "must support Arabic", start = content.indexOf(quote);
  const claim = normalizeClaimInput({claimText:"The portal supports Arabic.",quote,quoteStart:start,quoteEnd:start+quote.length,claimKind:"need",extractionConfidence:0.9}, content);
  assert.equal(claim.quote, content.slice(claim.quoteStart, claim.quoteEnd));
  assert.equal(claim.extractionConfidence, 0.9);
});
test("invalid confidence and claim kinds are rejected", () => {
  const quote = "must support Arabic", start = content.indexOf(quote);
  const base = {claimText:"Arabic",quote,quoteStart:start,quoteEnd:start+quote.length};
  assert.throws(() => normalizeClaimInput({...base,extractionConfidence:2}, content), /Confidence/);
  assert.throws(() => normalizeClaimInput({...base,claimKind:"invented"}, content), /claim kind/);
});
