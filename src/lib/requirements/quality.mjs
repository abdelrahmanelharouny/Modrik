import { createHash } from "node:crypto";

export const QUALITY_DIMENSIONS = [
  "atomicity","clarity","completeness","testability","consistency",
  "traceability","feasibility","verifiability","nfrCoverage",
];
export const QUALITY_STATUSES = ["proposed","accepted","rejected"];

export function hashRequirementSnapshot(requirement) {
  const snapshot = {
    text: String(requirement?.text ?? "").trim().replace(/\\s+/g," "),
    type: String(requirement?.type ?? "functional"),
    priority: String(requirement?.priority ?? "Should"),
    language: String(requirement?.language ?? "en"),
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function normalizeQualityAssessment(input, requirement) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Assessment payload must be an object.");
  const scores = {};
  for (const dimension of QUALITY_DIMENSIONS) {
    const value = Number(input[dimension]);
    if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`${dimension} must be an integer from 0 to 100.`);
    scores[dimension] = value;
  }
  const issues = input.issues === undefined ? [] : input.issues;
  if (!Array.isArray(issues) || issues.length > 20 || issues.some(x => typeof x !== "string" || !x.trim() || x.length > 250)) {
    throw new Error("Issues must be an array of up to 20 non-empty strings, each at most 250 characters.");
  }
  const suggestedRewrite = typeof input.suggestedRewrite === "string" ? input.suggestedRewrite.trim() : "";
  const assessmentNote = typeof input.assessmentNote === "string" ? input.assessmentNote.trim() : "";
  if (suggestedRewrite.length > 5000 || assessmentNote.length > 1000) throw new Error("Assessment text exceeds the allowed length.");
  const overallScore = Math.round(QUALITY_DIMENSIONS.reduce((sum,key)=>sum+scores[key],0)/QUALITY_DIMENSIONS.length);
  return {
    ...scores, overallScore, sourceText: String(requirement.text),
    sourceHash: hashRequirementSnapshot(requirement),
    issues: JSON.stringify(issues), suggestedRewrite: suggestedRewrite || null,
    assessmentNote,
  };
}

export function isQualityAssessmentCurrent(assessment, requirement) {
  return Boolean(assessment?.sourceHash && assessment.sourceHash === hashRequirementSnapshot(requirement));
}
