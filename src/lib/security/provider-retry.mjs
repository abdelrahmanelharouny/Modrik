export function retryableProviderFailure(error) {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  const statusFromProperty = Number(error.status ?? error.statusCode);
  const match = /\b(?:HTTP|status)\s*[:=]?\s*(\d{3})\b/i.exec(error.message);
  const status = Number.isInteger(statusFromProperty) && statusFromProperty > 0
    ? statusFromProperty
    : match
      ? Number(match[1])
      : null;
  if (status !== null) return [408, 425, 429].includes(status) || status >= 500;
  // Fetch network errors are commonly surfaced as TypeError; do not retry
  // arbitrary application/validation errors whose message may also say "network".
  return error.name === "TypeError";
}
