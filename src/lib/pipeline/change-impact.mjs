const ALLOWED_SOURCES = new Set(["github", "jira", "manual"]);
const ALLOWED_TRIAGE = Object.freeze({
  confirm: Object.freeze({ from: ["pending"], to: "confirmed" }),
  dismiss: Object.freeze({ from: ["pending", "confirmed"], to: "dismissed" }),
  resolve: Object.freeze({ from: ["pending", "confirmed"], to: "resolved" }),
});
export function normalizeChangeImpactInput(input = {}) {
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const source = typeof input.source === "string" ? input.source : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const signal = typeof input.signal === "string" ? input.signal.trim() : "";
  if (!projectId || projectId.length > 128) throw new TypeError("projectId is required.");
  if (!ALLOWED_SOURCES.has(source)) throw new TypeError("Unsupported change-impact source.");
  if (!idempotencyKey || idempotencyKey.length > 255) throw new TypeError("A bounded idempotency key is required.");
  if (!signal || signal.length > 2000) throw new RangeError("Change-impact signal must contain 1–2000 characters.");
  return {
    projectId, source, idempotencyKey, signal,
    externalKey: String(input.externalKey ?? idempotencyKey).slice(0, 200),
    externalUrl: typeof input.externalUrl === "string" ? input.externalUrl.slice(0, 2000) : "",
    title: String(input.title ?? "Project change").slice(0, 200),
  };
}
export function resolveChangeImpactTriage(currentStatus, action) {
  const transition = ALLOWED_TRIAGE[action];
  if (!transition || !transition.from.includes(currentStatus)) return null;
  return { action, from: currentStatus, to: transition.to };
}
export function changeImpactFindingIsActive(status) {
  return status === "pending" || status === "confirmed";
}
