export const CLAIM_KINDS = ["need", "goal", "constraint", "preference", "risk", "metric", "pain_point", "assumption", "fact"];
export const CLAIM_STATUSES = ["proposed", "in_review", "accepted", "rejected", "needs_clarification"];
export const CLAIM_RELATIONSHIPS = ["supports", "contradicts", "qualifies", "derives"];

export function validateClaimSpan(content, quote, start, end) {
  if (typeof content !== "string" || typeof quote !== "string" || !quote.trim()) return false;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > content.length) return false;
  return content.slice(start, end) === quote;
}

export function findExactQuoteSpans(content, quote) {
  if (typeof content !== "string" || typeof quote !== "string" || !quote.trim()) return [];
  const spans = [];
  let cursor = 0;
  while (cursor <= content.length - quote.length) {
    const start = content.indexOf(quote, cursor);
    if (start < 0) break;
    spans.push({ start, end: start + quote.length });
    cursor = start + Math.max(1, quote.length);
  }
  return spans;
}

export function normalizeClaimInput(input, content) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Claim payload must be an object.");
  const claimText = typeof input.claimText === "string" ? input.claimText.trim() : "";
  const quote = typeof input.quote === "string" ? input.quote : "";
  const claimKind = typeof input.claimKind === "string" ? input.claimKind : "fact";
  const polarity = typeof input.polarity === "string" ? input.polarity : "neutral";
  const modality = typeof input.modality === "string" ? input.modality : "reported";
  const confidence = input.extractionConfidence === undefined ? 0.5 : Number(input.extractionConfidence);
  if (!claimText || claimText.length > 1000) throw new Error("Claim text is required and limited to 1,000 characters.");
  if (quote.length < 3 || quote.length > 2000) throw new Error("A verbatim source quote between 3 and 2,000 characters is required.");
  if (!CLAIM_KINDS.includes(claimKind)) throw new Error("Unsupported claim kind.");
  if (!["affirmative", "negative", "neutral"].includes(polarity)) throw new Error("Unsupported claim polarity.");
  if (!["must", "should", "may", "wants", "reported", "hypothetical"].includes(modality)) throw new Error("Unsupported claim modality.");
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("Confidence must be between 0 and 1.");
  const start = input.quoteStart, end = input.quoteEnd;
  if (!validateClaimSpan(content, quote, start, end)) throw new Error("Quote offsets do not match the selected evidence revision.");
  return { claimText, quote, quoteStart: start, quoteEnd: end, claimKind, polarity, modality,
    speaker: typeof input.speaker === "string" ? input.speaker.trim().slice(0, 160) || null : null,
    extractionConfidence: confidence, extractionNote: typeof input.extractionNote === "string" ? input.extractionNote.slice(0, 500) : "" };
}
