export const ARABIC_ASR_EVALUATION_VERSION = "modrik-ar-asr-eval-v1";

const ARABIC_TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu;
const PUNCTUATION = /\p{P}+/gu;

/** Conservative Arabic normalization for comparable WER/CER evaluation. */
export function normalizeAsrEvaluationText(value) {
  if (typeof value !== "string") throw new TypeError("ASR evaluation text must be a string.");
  return value.normalize("NFKC")
    .replace(ARABIC_TASHKEEL, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ؤ/gu, "و")
    .replace(/ئ/gu, "ي")
    .replace(/ء/gu, "")
    .replace(/[ة]/gu, "ه")
    .replace(PUNCTUATION, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function editCounts(reference, hypothesis) {
  const rows = reference.length + 1;
  const columns = hypothesis.length + 1;
  const dp = Array.from({ length: rows }, () => new Uint32Array(columns));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < columns; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const cost = reference[i - 1] === hypothesis[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  let i = reference.length, j = hypothesis.length;
  let substitutions = 0, deletions = 0, insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && reference[i - 1] === hypothesis[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      i -= 1; j -= 1; continue;
    }
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      substitutions += 1; i -= 1; j -= 1; continue;
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions += 1; i -= 1; continue;
    }
    if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      insertions += 1; j -= 1; continue;
    }
    throw new Error("ASR edit-distance backtrace failed.");
  }
  return { substitutions, deletions, insertions, errors: substitutions + deletions + insertions };
}

function ratio(errors, referenceUnits) {
  return referenceUnits > 0 ? Number((errors / referenceUnits).toFixed(6)) : null;
}

export function evaluateAsrTranscriptPair(input = {}) {
  const referenceText = normalizeAsrEvaluationText(input.reference);
  const hypothesisText = normalizeAsrEvaluationText(input.hypothesis);
  const referenceWords = referenceText ? referenceText.split(" ") : [];
  const hypothesisWords = hypothesisText ? hypothesisText.split(" ") : [];
  const word = editCounts(referenceWords, hypothesisWords);
  const referenceCharacters = [...referenceText];
  const hypothesisCharacters = [...hypothesisText];
  const character = editCounts(referenceCharacters, hypothesisCharacters);
  return {
    language: typeof input.language === "string" && input.language ? input.language : "unspecified",
    provider: typeof input.provider === "string" && input.provider ? input.provider : "unspecified",
    referenceWordCount: referenceWords.length,
    hypothesisWordCount: hypothesisWords.length,
    referenceCharacterCount: referenceCharacters.length,
    hypothesisCharacterCount: hypothesisCharacters.length,
    substitutions: word.substitutions,
    deletions: word.deletions,
    insertions: word.insertions,
    wordErrors: word.errors,
    characterErrors: character.errors,
    wer: ratio(word.errors, referenceWords.length),
    cer: ratio(character.errors, referenceCharacters.length),
    emptyReference: referenceWords.length === 0,
  };
}

/**
 * Corpus-level micro WER/CER plus per-language/per-provider slices.
 * Input should contain only consented transcript/reference text, never audio.
 */
export function evaluateAsrTranscriptCorpus(records) {
  if (!Array.isArray(records)) throw new TypeError("ASR evaluation corpus must be an array.");
  const valid = records.map((row) => evaluateAsrTranscriptPair(row));
  const eligible = valid.filter((row) => !row.emptyReference);
  const aggregate = (rows) => {
    const referenceWords = rows.reduce((sum, row) => sum + row.referenceWordCount, 0);
    const referenceCharacters = rows.reduce((sum, row) => sum + row.referenceCharacterCount, 0);
    const wordErrors = rows.reduce((sum, row) => sum + row.wordErrors, 0);
    const characterErrors = rows.reduce((sum, row) => sum + row.characterErrors, 0);
    return {
      sampleCount: rows.length,
      excludedEmptyReferences: valid.length - eligible.length,
      referenceWordCount: referenceWords,
      referenceCharacterCount: referenceCharacters,
      wordErrors,
      characterErrors,
      wer: ratio(wordErrors, referenceWords),
      cer: ratio(characterErrors, referenceCharacters),
    };
  };
  const slice = (key) => {
    const groups = new Map();
    for (const row of eligible) {
      if (!groups.has(row[key])) groups.set(row[key], []);
      groups.get(row[key]).push(row);
    }
    return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, rows]) => [name, aggregate(rows)]));
  };
  return {
    version: ARABIC_ASR_EVALUATION_VERSION,
    metricDefinition: "Micro WER and CER after the documented Arabic NFKC/diacritic/alef/ya/hamza/punctuation normalization. WER/CER may exceed 1.0 when insertions dominate.",
    totalSamples: valid.length,
    excludedEmptyReferences: valid.length - eligible.length,
    overall: aggregate(eligible),
    byLanguage: slice("language"),
    byProvider: slice("provider"),
  };
}
