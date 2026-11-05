const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const RRF_K = 60;
const DEFAULT_SCAN_BATCH_SIZE = 250;
const MAX_SCAN_BATCH_SIZE = 500;

/** Read all authorized candidates in stable keyset pages; caller owns tenant/status filtering. */
export async function scanOrganizationMemoryCandidates(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Organization memory scan input must be an object.");
  if (!input.where || typeof input.where !== "object" || Array.isArray(input.where)) throw new TypeError("A pre-authorized candidate filter is required.");
  if (typeof input.findMany !== "function") throw new TypeError("A database findMany adapter is required.");
  const raw = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, MAX_SCAN_BATCH_SIZE) : DEFAULT_SCAN_BATCH_SIZE;
  const rows = [], seen = new Set(); let pages = 0;
  while (true) {
    const where = pages === 0 ? input.where : { ...input.where, AND: [...(Array.isArray(input.where.AND) ? input.where.AND : []), { OR: [{ updatedAt: { lt: rows.at(-1).updatedAt } }, { updatedAt: rows.at(-1).updatedAt, id: { gt: rows.at(-1).id } }] }] };
    const batch = await input.findMany({ where, take: batchSize, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], ...(input.include ? { include: input.include } : {}) });
    if (!Array.isArray(batch)) throw new TypeError("Database scan adapter must return an array.");
    pages += 1;
    for (const row of batch) {
      if (!row || typeof row.id !== "string" || !row.id || !(row.updatedAt instanceof Date) || Number.isNaN(row.updatedAt.getTime())) throw new TypeError("Database scan returned an invalid keyset anchor.");
      if (seen.has(row.id)) throw new Error("Database scan returned a duplicate candidate.");
      seen.add(row.id); rows.push(row);
    }
    if (batch.length < batchSize) break;
    if (pages > 1_000_000) throw new Error("Database scan exceeded its safety page limit.");
  }
  return { rows, pages, batchSize, candidatesScanned: rows.length };
}

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
    // BM25 query terms are set-valued: repetition must not inflate relevance.
    for (const term of new Set(queryTokens)) {
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


/**
 * Evaluate a ranked list against a binary relevance set.
 * Duplicate IDs count once at their first rank, preventing metric inflation.
 */
export function evaluateOrganizationMemoryRanking(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Ranking evaluation input must be an object.");
  const rawK = Number(input.k);
  const k = Number.isSafeInteger(rawK) && rawK > 0 ? Math.min(rawK, 1000) : 10;
  const relevant = new Set(Array.isArray(input.relevantIds) ? input.relevantIds.filter((id) => typeof id === "string" && id.length > 0) : []);
  const ranked = [], seen = new Set();
  for (const id of Array.isArray(input.rankedIds) ? input.rankedIds : []) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id); ranked.push(id);
  }
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  const firstRelevantRank = top.findIndex((id) => relevant.has(id));
  let dcg = 0;
  top.forEach((id, index) => { if (relevant.has(id)) dcg += 1 / Math.log2(index + 2); });
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let index = 0; index < idealHits; index += 1) idcg += 1 / Math.log2(index + 2);
  return {
    k, relevantCount: relevant.size, retrievedCount: top.length, hits,
    precisionAtK: top.length ? hits / top.length : 0,
    recallAtK: relevant.size ? hits / relevant.size : 0,
    reciprocalRank: firstRelevantRank < 0 ? 0 : 1 / (firstRelevantRank + 1),
    ndcgAtK: idcg ? dcg / idcg : 0,
  };
}


/**
 * Aggregate query-level retrieval judgments into macro-averaged benchmark
 * metrics. Queries without relevance judgments are reported but excluded from
 * ranking-quality averages; language labels are normalized to stable buckets.
 */
export function evaluateOrganizationMemoryBenchmark(queries = []) {
  if (!Array.isArray(queries)) throw new TypeError("Benchmark queries must be an array.");
  const buckets = new Map();
  let evaluatedQueries = 0;
  let excludedUnjudgedQueries = 0;
  let totalRelevant = 0;
  let totalRetrieved = 0;
  let totalHits = 0;
  for (const query of queries) {
    if (!query || typeof query !== "object" || Array.isArray(query)) {
      throw new TypeError("Each benchmark query must be an object.");
    }
    const metrics = evaluateOrganizationMemoryRanking(query);
    const language = typeof query.language === "string" && query.language.trim()
      ? query.language.trim().toLowerCase().slice(0, 32) : "unspecified";
    if (!buckets.has(language)) buckets.set(language, []);
    if (metrics.relevantCount === 0) {
      excludedUnjudgedQueries += 1;
      continue;
    }
    evaluatedQueries += 1;
    totalRelevant += metrics.relevantCount;
    totalRetrieved += metrics.retrievedCount;
    totalHits += metrics.hits;
    buckets.get(language).push(metrics);
  }
  const average = (rows, key) => rows.length
    ? rows.reduce((sum, row) => sum + row[key], 0) / rows.length : 0;
  const summarize = (rows) => ({
    queryCount: rows.length,
    precisionAtK: average(rows, "precisionAtK"),
    recallAtK: average(rows, "recallAtK"),
    mrr: average(rows, "reciprocalRank"),
    ndcgAtK: average(rows, "ndcgAtK"),
  });
  const perLanguage = {};
  for (const [language, rows] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    perLanguage[language] = summarize(rows);
  }
  const all = [...buckets.values()].flat();
  return {
    totalQueries: queries.length,
    evaluatedQueries,
    excludedUnjudgedQueries,
    microPrecision: totalRetrieved ? totalHits / totalRetrieved : 0,
    microRecall: totalRelevant ? totalHits / totalRelevant : 0,
    macro: summarize(all),
    perLanguage,
  };
}


function compareMemoryCursorOrder(left, right) {
  const timeDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
  return timeDelta || left.id.localeCompare(right.id);
}

function scoreMemoryDocument(queryTerms, tokens, documentFrequency, documentCount, averageLength) {
  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const k1 = 1.2, b = 0.75;
  let score = 0;
  for (const term of queryTerms) {
    const frequency = frequencies.get(term) ?? 0;
    if (!frequency) continue;
    const df = documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (documentCount - df + 0.5) / (df + 0.5));
    const denominator = frequency + k1 * (1 - b + b * (averageLength ? tokens.length / averageLength : 0));
    score += idf * (frequency * (k1 + 1)) / denominator;
  }
  return score;
}

/**
 * Exact two-pass BM25 over a tenant-scoped, keyset-paginated corpus.
 * Memory is O(queryTerms + batchSize + resultLimit), not O(corpus size).
 * Run inside a serializable read transaction when the adapter supports it.
 */
export async function rankOrganizationMemoryCandidatesStream(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Streaming ranking input must be an object.");
  const projectIds = new Set(Array.isArray(input.projectIds) ? input.projectIds.filter((id) => typeof id === "string" && id.trim()) : []);
  if (!projectIds.size) return { rows: [], candidatesScanned: 0, pages: 0, batchSize: DEFAULT_SCAN_BATCH_SIZE, passes: 2 };
  if (!input.where || input.where.status !== "accepted" || !Array.isArray(input.where.projectId?.in) ||
      input.where.projectId.in.length === 0 || input.where.projectId.in.some((id) => !projectIds.has(id))) {
    throw new TypeError("Streaming ranking requires an accepted-only, authorized project filter.");
  }
  if (typeof input.findMany !== "function") throw new TypeError("A database findMany adapter is required.");
  const queryTerms = [...new Set(tokenizeOrganizationMemoryText(input.query))];
  if (!queryTerms.length) return { rows: [], candidatesScanned: 0, pages: 0, batchSize: DEFAULT_SCAN_BATCH_SIZE, passes: 2 };
  const rawBatch = Number(input.batchSize);
  const batchSize = Number.isSafeInteger(rawBatch) && rawBatch > 0 ? Math.min(rawBatch, MAX_SCAN_BATCH_SIZE) : DEFAULT_SCAN_BATCH_SIZE;
  const limit = boundedLimit(input.limit);
  const snapshotAt = input.snapshotAt instanceof Date && Number.isFinite(input.snapshotAt.getTime()) ? input.snapshotAt : new Date();
  const whereBase = {
    ...input.where,
    AND: [...(Array.isArray(input.where.AND) ? input.where.AND : []), { updatedAt: { lte: snapshotAt } }],
  };
  const select = {
    id: true, projectId: true, status: true, kind: true, label: true,
    description: true, updatedAt: true,
    ...(input.withProject ? {
      nodeRef: true, confidence: true, origin: true, owner: true,
      project: { select: { name: true } },
    } : {}),
  };
  const scanPass = async (onRow, withProject = false) => {
    let cursor = null, pages = 0, count = 0, previous = null;
    while (true) {
      const where = cursor ? {
        ...whereBase,
        AND: [...whereBase.AND, { OR: [
          { updatedAt: { lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, id: { gt: cursor.id } },
        ] }],
      } : whereBase;
      const batch = await input.findMany({
        where, take: batchSize,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: withProject ? select : {
          id: true, projectId: true, status: true, kind: true,
          label: true, description: true, updatedAt: true,
        },
      });
      if (!Array.isArray(batch)) throw new TypeError("Database scan adapter must return an array.");
      pages += 1;
      for (const row of batch) {
        if (!row || typeof row.id !== "string" || !row.id ||
            !(row.updatedAt instanceof Date) || Number.isNaN(row.updatedAt.getTime()) ||
            !projectIds.has(row.projectId) || row.status !== "accepted" ||
            typeof row.label !== "string") {
          throw new TypeError("Database scan returned an invalid or unauthorized candidate.");
        }
        if (previous && compareMemoryCursorOrder(previous, row) >= 0) {
          throw new Error("Database scan violated stable keyset ordering.");
        }
        previous = row;
        count += 1;
        await onRow(row);
      }
      if (batch.length < batchSize) break;
      const last = batch[batch.length - 1];
      cursor = { id: last.id, updatedAt: last.updatedAt };
      if (pages > 1_000_000) throw new Error("Database scan exceeded its safety page limit.");
    }
    return { pages, count };
  };

  const documentFrequency = new Map();
  let documentCount = 0, totalLength = 0;
  const first = await scanPass((row) => {
    const tokens = tokenizeOrganizationMemoryText([row.label, row.description, row.kind].filter(Boolean).join(" "));
    documentCount += 1;
    totalLength += tokens.length;
    const uniqueTokens = new Set(tokens);
    for (const term of queryTerms) {
      if (uniqueTokens.has(term)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  });
  const averageLength = documentCount ? totalLength / documentCount : 0;
  const top = [];
  const second = await scanPass((row) => {
    const tokens = tokenizeOrganizationMemoryText([row.label, row.description, row.kind].filter(Boolean).join(" "));
    const score = scoreMemoryDocument(queryTerms, tokens, documentFrequency, documentCount, averageLength);
    if (!(score > 0) || !Number.isFinite(score)) return;
    const candidate = { ...row, retrieval: { mode: "lexical", score: Number(score.toFixed(8)) } };
    let low = 0, high = top.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const current = top[mid];
      if (current.retrieval.score > candidate.retrieval.score ||
          (current.retrieval.score === candidate.retrieval.score && current.id.localeCompare(candidate.id) < 0)) low = mid + 1;
      else high = mid;
    }
    top.splice(low, 0, candidate);
    if (top.length > limit) top.pop();
  }, true);
  return {
    rows: top,
    candidatesScanned: first.count,
    rankingCandidatesScanned: second.count,
    pages: first.pages + second.pages,
    batchSize,
    passes: 2,
    snapshotAt: snapshotAt.toISOString(),
  };
}
