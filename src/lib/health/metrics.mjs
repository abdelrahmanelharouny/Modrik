function clampPercent(value) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function assessedMetric(score, coverage) {
  return {
    score: score == null ? null : clampPercent(score),
    assessed: score != null,
    coverage: coverage == null ? null : clampPercent(coverage),
  };
}

export function computeHealthScores({ requirements = [], questions = [], conflicts = [], scenarios = [], conflictDetectionComplete = false }) {
  const total = requirements.length;
  const assessedAmbiguity = requirements.filter((requirement) =>
    Number.isFinite(requirement.ambiguity) && requirement.ambiguity >= 0 && requirement.ambiguity <= 100
  );
  const ambiguityScore = assessedAmbiguity.length
    ? assessedAmbiguity.reduce((sum, requirement) => sum + requirement.ambiguity, 0) / assessedAmbiguity.length
    : null;

  const weak = requirements.filter((requirement) => requirement.verifyStatus === "weak");
  const unverified = requirements.filter((requirement) => requirement.verifyStatus === "unverified");
  const verificationScore = total
    ? ((weak.length + unverified.length * 0.5) / total) * 100
    : null;

  const decided = questions.filter((question) =>
    question.resolution === "proceed_with_uncertainty" ||
    question.resolution === "skipped" ||
    (question.resolution === "answered" &&
      question.answerSource !== "synthetic" &&
      typeof question.answer === "string" &&
      question.answer.trim().length > 0 &&
      !question.answer.trim().startsWith("[synthetic · wind tunnel]"))
  );
  const assumptions = questions.filter((question) => question.resolution === "proceed_with_uncertainty");
  const uncertaintyScore = decided.length ? (assumptions.length / decided.length) * 100 : null;

  const openConflicts = conflicts.filter((conflict) => conflict.status === "open");
  const conflictWeight = openConflicts.reduce((sum, conflict) =>
    sum + ({ high: 3, medium: 2, low: 1 }[conflict.severity] ?? 2), 0
  );
  const conflictScore = conflictDetectionComplete
    ? (conflicts.length ? (conflictWeight / (conflicts.length * 3)) * 100 : 0)
    : null;

  const untraced = requirements.filter((requirement) => !Array.isArray(requirement.links) || requirement.links.length === 0);
  const traceabilityScore = total ? (untraced.length / total) * 100 : null;

  const undefinedScenarios = scenarios.filter((scenario) => scenario.resolution === "undefined");
  const executabilityScore = scenarios.length
    ? (undefinedScenarios.length / scenarios.length) * 100
    : null;

  return {
    ambiguity: assessedMetric(ambiguityScore, total ? (assessedAmbiguity.length / total) * 100 : null),
    verification: assessedMetric(verificationScore, total ? 100 : null),
    uncertainty: assessedMetric(uncertaintyScore, questions.length ? (decided.length / questions.length) * 100 : null),
    conflict: assessedMetric(conflictScore, conflictDetectionComplete ? 100 : null),
    traceability: assessedMetric(traceabilityScore, total ? 100 : null),
    executability: assessedMetric(executabilityScore, scenarios.length ? 100 : null),
    counts: {
      totalRequirements: total,
      assessedAmbiguity: assessedAmbiguity.length,
      weakVerification: weak.length,
      unverified: unverified.length,
      decidedQuestions: decided.length,
      pendingQuestions: questions.filter((question) => question.resolution === "pending").length,
      assumptions: assumptions.length,
      openConflicts: openConflicts.length,
      untraced: untraced.length,
      undefinedScenarios: undefinedScenarios.length,
      definedScenarios: scenarios.filter((scenario) => scenario.resolution === "defined").length,
    },
  };
}
