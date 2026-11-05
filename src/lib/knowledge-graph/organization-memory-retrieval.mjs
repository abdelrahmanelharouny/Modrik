const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const RRF_K = 60;

/** Normalize English, Arabic and code-switched text without transliterating it. */
export function normalizeOrganizationMemoryText(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[إأآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ؤ/gu, "و")
    .replace(/ئ/gu, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tokenizeOrganizationMemoryText(value) {
  const normalized = normalizeOrganizationMemoryText(value);
  return normalized ? normalized.split(/\s+/u).filter(Boolean) : [];
}

function boundedLimit(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

function bm25(queryTokens, documents) {
  const tokenized = documents.map((document) => tokenizeOrganizationMemoryText(
    [document.label, document.description, document.kind].filter(Boolean).join(" "),
  ));
  const averageLength = tokenized.length
    ? tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length : 0;
  const documentFrequency = new Map();
  for (const tokens of tokenized) for (const term of new Set(tokens)) {
    documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const k1 = 1.2, b = 0.75;
  return documents.map((document, index) => {
    const tokens = tokenized[index], frequencies = new Map();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of queryTokens) {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + k1 * (1 - b + b * (averageLength ? tokens.length / averageLength : 0));
      score += idf * (frequency * (k1 + 1)) / denominator;
    }
    return { id: document.id, score };
  });
}

function reciprocalRankFusion(rankings) {
  const scores = new Map();
  for (const ranking of rankings) ranking.forEach((item, index) => {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (RRF_K + index + 1));
  });
  return scores;
}

/**
 * Rank only the caller-authorized, accepted candidate set.
 * semanticScores MUST originate from a provider that applied the same tenant
 * and project filter inside its retrieval query, before nearest-neighbor top-K.
 */
export function rankOrganizationMemoryCandidates(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Organization memory ranking input must be an object.");
  }
  const projectIds = new Set(Array.isArray(input.projectIds)
    ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : []);
  if (!projectIds.size) return [];

  const candidates = Array.isArray(input.candidates) ? input.candidates.filter((item) =>
    item && typeof item === "object" && typeof item.id === "string" &&
    typeof item.projectId === "string" && projectIds.has(item.projectId) &&
    item.status === "accepted" && typeof item.label === "string"
  ) : [];
  if (!candidates.length) return [];

  const mode = ["lexical", "semantic", "hybrid"].includes(input.mode) ? input.mode : "lexical";
  const limit = boundedLimit(input.limit);
  const queryTokens = tokenizeOrganizationMemoryText(input.query);
  const lexical = queryTokens.length ? bm25(queryTokens, candidates) : [];
  lexical.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const semanticById = new Map();
  for (const item of Array.isArray(input.semanticScores) ? input.semanticScores : []) {
    if (!item || typeof item.id !== "string" || !Number.isFinite(item.score) ||
        item.score < 0 || item.score > 1) continue;
    semanticById.set(item.id, item.score);
  }
  const allowedIds = new Set(candidates.map((item) => item.id));
  const semantic = [...semanticById.entries()].filter(([id]) => allowedIds.has(id))
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  let scoreById;
  if (mode === "lexical") scoreById = new Map(lexical.map((item) => [item.id, item.score]));
  else if (mode === "semantic") scoreById = new Map(semantic.map((item) => [item.id, item.score]));
  else scoreById = reciprocalRankFusion([lexical.filter((item) => item.score > 0), semantic]);

  const byId = new Map(candidates.map((item) => [item.id, item]));
  return [...scoreById.entries()].filter(([, score]) => Number.isFinite(score) && score > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([id, score]) => ({ ...byId.get(id), retrieval: { mode, score: Number(score.toFixed(8)) } }));
}
