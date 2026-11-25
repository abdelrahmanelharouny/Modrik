const ARABIC = /[\u0600-\u06FF]/u;
const LATIN = /[A-Za-z]/u;
const EGYPTIAN_CUES = new Set([
  "ازيك","إزيك","ازاي","إزاي","عايز","عايزة","عاوز","مش","مفيش","فيه","كده","كذا",
  "ده","دي","دول","احنا","إحنا","انت","إنت","انتي","إنتي","عشان","علشان","يبقى",
  "بقى","لسه","دلوقتي","تمام","ماشي","معلش","خالص","بتاع","بتاعة","حاجة","حاجه",
  "ليه","فين","امتى","إمتى","قدام","ورا","جوه","بره","هن","هت","كان","كانت",
]);
function normalizeArabic(value) {
  return value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[إأآٱ]/gu, "ا").replace(/ى/gu, "ي").toLowerCase();
}
function safeRatio(numerator, denominator) { return denominator ? Number((numerator / denominator).toFixed(4)) : 0; }

/** Conservative transcript QA; dialect cues are not a recognition-accuracy estimate. */
export function assessArabicTranscriptQuality(input = {}) {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const expectedLanguage = ["ar-EG", "codeswitch", "en"].includes(input.expectedLanguage) ? input.expectedLanguage : "unspecified";
  const letters = [...text].filter((char) => /\p{L}/u.test(char));
  const arabicLetters = letters.filter((char) => ARABIC.test(char)).length;
  const latinLetters = letters.filter((char) => LATIN.test(char)).length;
  const tokens = normalizeArabic(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const cueMatches = [...new Set(tokens.filter((token) => EGYPTIAN_CUES.has(token)))].slice(0, 12);
  const arabicRatio = safeRatio(arabicLetters, letters.length);
  const latinRatio = safeRatio(latinLetters, letters.length);
  const mixedScript = arabicLetters > 0 && latinLetters > 0;
  const scriptMismatch = expectedLanguage === "ar-EG" ? arabicRatio < 0.45 : expectedLanguage === "en" ? latinRatio < 0.45 : false;
  const reasons = [];
  if ([...text].length < 8 || tokens.length < 2) reasons.push("transcript_too_short");
  if (scriptMismatch) reasons.push("expected_language_script_mismatch");
  if (/([\p{L}\p{N}])\1{5,}/u.test(text)) reasons.push("repeated_character_run");
  if (tokens.length >= 4 && new Set(tokens).size / tokens.length < 0.35) reasons.push("high_token_repetition");
  return {
    expectedLanguage, characterCount: [...text].length, tokenCount: tokens.length,
    arabicLetterRatio: arabicRatio, latinLetterRatio: latinRatio, mixedScript,
    dialectCueMatches: cueMatches, dialectSignals: cueMatches.length ? "egyptian_cues_observed" : "not_assessed",
    reviewRequired: reasons.length > 0, reviewReasons: reasons,
    caveat: "Script and dialect cues are weak QA signals. They do not estimate word error rate, semantic fidelity, speaker intent, or Egyptian dialect accuracy.",
  };
}
