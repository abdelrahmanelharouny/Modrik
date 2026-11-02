export const STAKEHOLDER_APPROVAL_ROLES = ["decision_maker","approver","contributor","consulted","informed","observer"];
export const STAKEHOLDER_ENGAGEMENT = ["active","pending","unavailable","withdrawn"];
export const STAKEHOLDER_POSITIONS = ["supports","opposes","neutral","conditional"];
export const POSITION_STATUSES = ["proposed","accepted","rejected"];
export const NEGOTIATION_ROLES = ["proposer","approver","consulted","dissenting","informed"];
export const NEGOTIATION_STATUSES = ["proposed","approved","rejected"];

const boundedText = (value, field, max, { required = false } = {}) => {
  if (typeof value !== "string") throw new Error(field + " must be text.");
  const result = value.trim();
  if (required && !result) throw new Error(field + " is required.");
  if (result.length > max) throw new Error(field + " must be at most " + max + " characters.");
  return result;
};
const score = (value, field, fallback = 50) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(field + " must be an integer from 0 to 100.");
  return n;
};
const stringList = (value, field, maxItems = 20) => {
  const list = value === undefined ? [] : value;
  if (!Array.isArray(list) || list.length > maxItems || list.some(x => typeof x !== "string" || !x.trim() || x.length > 250)) {
    throw new Error(field + " must be an array of up to " + maxItems + " non-empty strings (250 characters each).");
  }
  return JSON.stringify(list.map(x => x.trim()));
};

export function normalizeStakeholder(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Stakeholder payload must be an object.");
  const approvalRole = input.approvalRole ?? "consulted";
  const engagementStatus = input.engagementStatus ?? "active";
  if (!STAKEHOLDER_APPROVAL_ROLES.includes(approvalRole)) throw new Error("Unsupported approvalRole.");
  if (!STAKEHOLDER_ENGAGEMENT.includes(engagementStatus)) throw new Error("Unsupported engagementStatus.");
  const preferredLanguage = input.preferredLanguage ?? "en";
  if (!["en","ar-EG","codeswitch"].includes(preferredLanguage)) throw new Error("Unsupported preferredLanguage.");
  return {
    stakeholderRef: boundedText(input.stakeholderRef, "stakeholderRef", 40, { required: true }),
    displayName: boundedText(input.displayName, "displayName", 120, { required: true }),
    role: boundedText(input.role, "role", 120, { required: true }),
    organization: boundedText(input.organization ?? "", "organization", 160),
    authorityScore: score(input.authorityScore, "authorityScore"),
    influenceScore: score(input.influenceScore, "influenceScore"),
    interestScore: score(input.interestScore, "interestScore"),
    approvalRole, engagementStatus, preferredLanguage,
    goals: stringList(input.goals, "goals"),
    concerns: stringList(input.concerns, "concerns"),
    notes: boundedText(input.notes ?? "", "notes", 2000),
  };
}

export function normalizeStakeholderPosition(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Position payload must be an object.");
  if (!STAKEHOLDER_POSITIONS.includes(input.position)) throw new Error("Unsupported stakeholder position.");
  const confidence = input.confidence === undefined ? 0.5 : Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("confidence must be between 0 and 1.");
  return {
    stakeholderId: boundedText(input.stakeholderId, "stakeholderId", 100, { required: true }),
    requirementId: boundedText(input.requirementId, "requirementId", 100, { required: true }),
    position: input.position, confidence,
    rationale: boundedText(input.rationale, "rationale", 2000, { required: true }),
    conditions: boundedText(input.conditions ?? "", "conditions", 2000),
  };
}

export function normalizePositionEvidence(input) {
  const relationship = input.relationship ?? "supports";
  if (!["supports","contradicts","qualifies","context"].includes(relationship)) throw new Error("Unsupported evidence relationship.");
  return {
    claimId: boundedText(input.claimId, "claimId", 100, { required: true }),
    relationship,
    note: boundedText(input.note ?? "", "note", 500),
  };
}

export function normalizeNegotiation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Negotiation payload must be an object.");
  const options = input.options ?? [];
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) throw new Error("Negotiation requires 2 to 10 options.");
  const normalizedOptions = options.map((option, index) => {
    if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("Each option must be an object.");
    return {
      id: boundedText(option.id ?? String(index + 1), "option.id", 40, { required: true }),
      label: boundedText(option.label, "option.label", 160, { required: true }),
      implications: boundedText(option.implications, "option.implications", 1000, { required: true }),
    };
  });
  if (new Set(normalizedOptions.map(x => x.id)).size !== normalizedOptions.length) throw new Error("Negotiation option ids must be unique.");
  return {
    requirementId: boundedText(input.requirementId, "requirementId", 100, { required: true }),
    title: boundedText(input.title, "title", 180, { required: true }),
    context: boundedText(input.context ?? "", "context", 2000),
    options: JSON.stringify(normalizedOptions),
  };
}

export function normalizeNegotiationDecision(input, optionsJson) {
  const options = JSON.parse(optionsJson || "[]");
  if (input.status === "approved") {
    if (typeof input.chosenOption !== "string" || !options.some(option => option.id === input.chosenOption)) {
      throw new Error("An approved negotiation must select one of the recorded options.");
    }
    return {
      status: "approved", chosenOption: input.chosenOption,
      rationale: boundedText(input.rationale, "rationale", 2000, { required: true }),
      tradeoffs: boundedText(input.tradeoffs ?? "", "tradeoffs", 2000),
      dissent: stringList(input.dissent, "dissent", 20),
    };
  }
  if (input.status !== "rejected") throw new Error("Decision status must be approved or rejected.");
  return {
    status: "rejected", chosenOption: null,
    rationale: boundedText(input.rationale, "rationale", 2000, { required: true }),
    tradeoffs: boundedText(input.tradeoffs ?? "", "tradeoffs", 2000),
    dissent: stringList(input.dissent, "dissent", 20),
  };
}

export function normalizeStakeholderUpdate(input, current) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Stakeholder update must be an object.");
  const engagementStatus = input.engagementStatus ?? current.engagementStatus;
  const approvalRole = input.approvalRole ?? current.approvalRole;
  if (!STAKEHOLDER_ENGAGEMENT.includes(engagementStatus)) throw new Error("Unsupported engagementStatus.");
  if (!STAKEHOLDER_APPROVAL_ROLES.includes(approvalRole)) throw new Error("Unsupported approvalRole.");
  return { engagementStatus, approvalRole };
}

export const NEGOTIATION_RESPONSE_STATUSES = ["supports","opposes","conditional","abstains"];
export function normalizeNegotiationResponse(input, optionsJson = "[]") {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Participant response must be an object.");
  if (!NEGOTIATION_RESPONSE_STATUSES.includes(input.responseStatus)) throw new Error("Unsupported participant response.");
  const options = JSON.parse(optionsJson || "[]");
  const responseOptionId = input.responseOptionId == null || input.responseOptionId === ""
    ? null
    : boundedText(input.responseOptionId, "responseOptionId", 40, { required: true });
  if (input.responseStatus === "supports" && (!responseOptionId || !options.some(option => option.id === responseOptionId))) {
    throw new Error("A supporting response must identify one of the recorded negotiation options.");
  }
  if (responseOptionId && !options.some(option => option.id === responseOptionId)) {
    throw new Error("responseOptionId must reference a recorded negotiation option.");
  }
  return {
    responseStatus: input.responseStatus,
    responseOptionId,
    rationale: boundedText(input.rationale, "rationale", 2000, { required: true }),
  };
}
export function assertNegotiationQuorum(participants) {
  if (!Array.isArray(participants) || participants.length < 2 || participants.length > 30) {
    throw new Error("A multi-stakeholder negotiation requires 2 to 30 participants.");
  }
  const ids = participants.map(p => p?.stakeholderId);
  if (ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
    throw new Error("Negotiation participants must have unique stakeholder ids.");
  }
  return true;
}

/**
 * Approval is permitted only when a designated decision maker or approver
 * is a participant and has explicitly supported the negotiation.
 * This is a governance gate, not identity authentication; API actions remain
 * protected by the configured owner session until multi-user RBAC exists.
 */
export function assertNegotiationDecisionAuthority(participants, decision) {
  if (!Array.isArray(participants)) throw new Error("Negotiation participants are required.");
  if (decision?.status !== "approved") return true;
  const authorizedSupport = participants.some(participant =>
    ["decision_maker", "approver"].includes(participant?.stakeholder?.approvalRole) &&
    participant?.responseStatus === "supports" &&
    participant?.responseOptionId === decision.chosenOption
  );
  if (!authorizedSupport) {
    throw new Error("Approval requires explicit support from at least one participating decision maker or approver.");
  }
  return true;
}

/**
 * Approval authority is snapshotted operationally by keeping governance roles
 * stable for the lifetime of an open negotiation. The owner must close/reject
 * the negotiation before changing a participant's approval role.
 */
export function assertStakeholderApprovalRoleChangeAllowed(nextRole, currentRole, openParticipationCount) {
  if (!STAKEHOLDER_APPROVAL_ROLES.includes(nextRole) || !STAKEHOLDER_APPROVAL_ROLES.includes(currentRole)) {
    throw new Error("Unsupported approvalRole.");
  }
  if (!Number.isInteger(openParticipationCount) || openParticipationCount < 0) {
    throw new Error("openParticipationCount must be a non-negative integer.");
  }
  if (nextRole !== currentRole && openParticipationCount > 0) {
    throw new Error("Close or reject open negotiations before changing a stakeholder approval role.");
  }
  return true;
}

export function assertStakeholderCanLeaveEngagement(nextStatus, pendingParticipationCount) {
  if (!STAKEHOLDER_ENGAGEMENT.includes(nextStatus)) throw new Error("Unsupported engagementStatus.");
  if (!Number.isInteger(pendingParticipationCount) || pendingParticipationCount < 0) {
    throw new Error("pendingParticipationCount must be a non-negative integer.");
  }
  if (["withdrawn", "unavailable"].includes(nextStatus) && pendingParticipationCount > 0) {
    throw new Error("Resolve or reject pending negotiations before withdrawing or making this stakeholder unavailable.");
  }
  return true;
}
