export const SYNTHETIC_ANSWER_PREFIX = "[synthetic · wind tunnel]";

export function isAiEligibleEvidence(evidence) {
  return Boolean(evidence && evidence.consent === true && evidence.origin !== "synthetic");
}

export function filterEvidenceForAI(evidences) {
  return Array.isArray(evidences) ? evidences.filter(isAiEligibleEvidence) : [];
}

export function isHumanStakeholderAnswer(question) {
  if (!question || question.answered !== true || question.resolution !== "answered") return false;
  const answer = typeof question.answer === "string" ? question.answer.trim() : "";
  if (!answer) return false;
  if (["synthetic", "assumption", "skipped"].includes(question.answerSource)) return false;
  return !answer.startsWith(SYNTHETIC_ANSWER_PREFIX);
}

export function hasHumanQuestionDecision(questions) {
  return Array.isArray(questions) && questions.some((question) =>
    isHumanStakeholderAnswer(question) || question?.resolution === "proceed_with_uncertainty"
  );
}

export function hasHumanCandidateEdits(candidates) {
  return Array.isArray(candidates) && candidates.some((candidate) =>
    candidate?.selected === true || Number(candidate?.impact) !== 3 || Number(candidate?.effort) !== 3
  );
}

export function evidenceContentBudget(sourceCount, totalBudget = 16000, perSourceMax = 4000) {
  if (!Number.isFinite(sourceCount) || sourceCount <= 0 ||
      !Number.isFinite(totalBudget) || totalBudget <= 0 ||
      !Number.isFinite(perSourceMax) || perSourceMax <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(perSourceMax), Math.floor(totalBudget / Math.floor(sourceCount))));
}
