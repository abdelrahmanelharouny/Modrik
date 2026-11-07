const TRANSITIONS = Object.freeze({
  submit_for_review: Object.freeze({ from: "proposed", to: "in_review", permission: "requirements:write" }),
  reject: Object.freeze({ from: "in_review", to: "rejected", permission: "requirements:review" }),
  approve: Object.freeze({ from: "in_review", to: "accepted", permission: "requirements:approve" }),
  archive: Object.freeze({ from: ["accepted", "rejected"], to: "archived", permission: "requirements:approve" }),
});

/**
 * Resolve an explicit, least-privilege governance transition.
 * Returns null for unknown actions or invalid source states.
 */
export function resolveOrganizationMemoryTransition(action, currentStatus) {
  if (typeof action !== "string" || !Object.hasOwn(TRANSITIONS, action)) return null;
  const transition = TRANSITIONS[action];
  const allowedFrom = Array.isArray(transition.from) ? transition.from : [transition.from];
  if (!allowedFrom.includes(currentStatus)) return null;
  return { action, from: currentStatus, to: transition.to, permission: transition.permission };
}

export function normalizeOrganizationMemoryReason(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
}
