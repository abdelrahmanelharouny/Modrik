export function selectByUtility(pool, k = 5, costBudget = 15) {
  const maxCount = Number.isFinite(k) ? Math.max(0, Math.floor(k)) : 0;
  const budget = Number.isFinite(costBudget) ? Math.max(0, costBudget) : 0;
  if (!Array.isArray(pool) || maxCount === 0 || budget === 0) return [];

  const scored = pool
    .map((question, index) => ({ question, index }))
    .filter(({ question }) =>
      question && question.utility &&
      Number.isFinite(Number(question.utility.utility)) &&
      Number.isFinite(Number(question.askCost)) &&
      Number(question.askCost) >= 1 && Number(question.askCost) <= 5
    )
    .sort((a, b) =>
      Number(b.question.utility.utility) - Number(a.question.utility.utility) || a.index - b.index
    );

  const selected = [];
  let spent = 0;
  for (const { question } of scored) {
    if (selected.length >= maxCount) break;
    const cost = Number(question.askCost);
    if (spent + cost > budget) continue;
    selected.push(question);
    spent += cost;
  }
  return selected;
}

export function selectDistinctPoolIndices(indices, poolLength, limit = 5) {
  if (!Array.isArray(indices) || !Number.isInteger(poolLength) || poolLength < 0) return [];
  const maxCount = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const seen = new Set();
  const selected = [];
  for (const value of indices) {
    const index = Number(value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= poolLength || seen.has(index)) continue;
    seen.add(index);
    selected.push(index);
    if (selected.length >= maxCount) break;
  }
  return selected;
}

export function clampSignalScore(value, fallback = 3) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : fallback;
}

export function deduplicateQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const seen = new Set();
  return questions.filter((question) => {
    const text = typeof question?.text === "string" ? question.text.trim() : "";
    const key = text.toLocaleLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function pickSeededIndices(poolLength, limit, seed) {
  if (!Number.isInteger(poolLength) || poolLength < 0 ||
      !Number.isFinite(limit) || limit < 0 || typeof seed !== "string" || !seed.length) {
    return [];
  }
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  if (state === 0) state = 0x6d2b79f5;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const indices = Array.from({ length: poolLength }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, Math.min(poolLength, Math.floor(limit)));
}
