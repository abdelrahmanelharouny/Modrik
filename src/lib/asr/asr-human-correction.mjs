const EMAIL_RE = /[\p{L}0-9._%+-]+@[\p{L}0-9.-]+\.[A-Za-z]{2,}/gu;
const EGYPTIAN_MOBILE_RE = /(?<![\p{L}\p{N}])(?:\+?20|0)?1[0125][0-9]{8}(?![\p{L}\p{N}])/gu;
const DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
function normalizeDigits(value) {
  return [...value].map((character) => {
    const index = DIGITS.indexOf(character);
    return index < 0 ? character : String(index < 10 ? index : index - 10);
  }).join("");
}
export function redactAsrTranscriptPii(value) {
  if (typeof value !== "string") throw new TypeError("Transcript must be text.");
  let text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const before = text;
  text = text.replace(EMAIL_RE, "[EMAIL REDACTED]");
  text = normalizeDigits(text).replace(EGYPTIAN_MOBILE_RE, "[PHONE REDACTED]");
  return { text: text.slice(0, 5000), redactions: {
    emailCount: (before.match(EMAIL_RE) ?? []).length,
    egyptianMobileCount: (before.match(EGYPTIAN_MOBILE_RE) ?? []).length,
  } };
}

/**
 * Validate a user's explicit, separate consent to retain a text-only ASR /
 * human-corrected pair. Audio is never accepted by this contract.
 */
export function prepareAsrHumanCorrection(input = {}) {
  if (input.consent !== true) throw new Error("Explicit ASR research consent is required.");
  const language = ["ar-EG", "codeswitch"].includes(input.language) ? input.language : "";
  if (!language) throw new TypeError("Only Egyptian Arabic and code-switched corrections are eligible.");
  for (const key of ["originalTranscript", "correctedTranscript"]) {
    if (typeof input[key] !== "string" || input[key].trim().length < 4 || input[key].length > 5000) {
      throw new RangeError(key + " must contain 4–5,000 characters.");
    }
  }
  const original = redactAsrTranscriptPii(input.originalTranscript);
  const corrected = redactAsrTranscriptPii(input.correctedTranscript);
  if (!original.text || !corrected.text) throw new TypeError("Redacted transcript pair must not be empty.");
  return {
    language,
    originalTranscript: original.text,
    correctedTranscript: corrected.text,
    redactions: {
      original: original.redactions,
      corrected: corrected.redactions,
    },
    consentVersion: "modrik-asr-text-correction-v1",
    audioStored: false,
  };
}
