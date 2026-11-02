import { hasHumanQuestionDecision } from "../security/data-safety.mjs";

export function validateElicitationApproval(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return "No questions to review — run the planner first.";
  }
  if (!hasHumanQuestionDecision(questions)) {
    return "At least one real stakeholder answer or an explicitly recorded uncertainty decision is required. Synthetic Wind Tunnel answers do not count.";
  }
  return null;
}

export function validateRequirementApproval(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return "No requirements extracted — run the agent first.";
  }
  const ungrounded = requirements.filter((requirement) =>
    !Array.isArray(requirement?.links) ||
    !requirement.links.some((link) => typeof link?.evidenceId === "string" && link.evidenceId.length > 0)
  );
  if (ungrounded.length) {
    return "Requirements without an active Evidence ID trace link must be grounded or removed: " +
      ungrounded.map((r) => r.refId).join(", ") + ".";
  }
  const unverified = requirements.filter((requirement) =>
    !["supported", "weak"].includes(requirement.verifyStatus)
  );
  if (unverified.length) {
    return "Requirements without a verifier verdict must be reviewed: " +
      unverified.map((r) => r.refId).join(", ") + ".";
  }
  const notHumanReviewed = requirements.filter((requirement) =>
    requirement.verificationSource !== "human"
  );
  if (notHumanReviewed.length) {
    return "Every requirement must receive an explicit human evidence review before approval: " +
      notHumanReviewed.map((r) => r.refId).join(", ") + ".";
  }
  return null;
}

export function validateConflictApproval(conflicts) {
  if (!Array.isArray(conflicts)) return "Conflict state could not be validated.";
  const unresolved = conflicts.filter((conflict) => conflict.status !== "resolved");
  return unresolved.length
    ? unresolved.length + " conflict(s) remain unresolved. Resolve each conflict before completing the baseline."
    : null;
}

export function validateStoryApproval(storyCount) {
  return Number.isInteger(storyCount) && storyCount > 0
    ? null
    : "No user stories exist — generate stories or record why stories are not applicable before approval.";
}
