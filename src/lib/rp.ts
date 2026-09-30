// ─────────────────────────────────────────────────────────────
// RequirementPilot — shared types & pipeline stage definitions
// ─────────────────────────────────────────────────────────────

export const STAGES = [
  "ELICITATION",
  "PROBLEM_SELECTION",
  "EXTRACTION",
  "AMBIGUITY",
  "STORIES",
  "CONFLICTS",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_META: Record<
  Stage,
  { index: number; title: string; agent: string; blurb: string; hitl: string }
> = {
  ELICITATION: {
    index: 0,
    title: "Elicitation",
    agent: "Questioner Agent",
    blurb:
      "The agent studies your project brief and evidence, then raises clarifying questions. You answer them — the answers steer everything downstream.",
    hitl: "Answer the questions, then approve to continue",
  },
  PROBLEM_SELECTION: {
    index: 1,
    title: "Problem Selection",
    agent: "Scope Agent",
    blurb:
      "Impact-aware problem selection: the agent proposes candidate problem statements grounded in your evidence. You score impact vs. effort and pick what to pursue.",
    hitl: "Score impact & effort, select one problem, then approve",
  },
  EXTRACTION: {
    index: 2,
    title: "Requirement Extraction",
    agent: "Extraction Agent",
    blurb:
      "The agent extracts atomic requirements from the brief, evidence and your answers — each one grounded in cited evidence sources (E1, E2, …).",
    hitl: "Review, edit or remove requirements, then approve",
  },
  AMBIGUITY: {
    index: 3,
    title: "Ambiguity Analysis",
    agent: "Ambiguity Agent",
    blurb:
      "Every requirement is scored for ambiguity (0–100) with the specific weak phrases flagged, and a sharper rewrite is proposed where needed.",
    hitl: "Accept suggested rewrites or keep originals, then approve",
  },
  STORIES: {
    index: 4,
    title: "User Story Generation",
    agent: "Story Agent",
    blurb:
      "Approved requirements are transformed into user stories with acceptance criteria and an INVEST quality score.",
    hitl: "Review stories and acceptance criteria, then approve",
  },
  CONFLICTS: {
    index: 5,
    title: "Conflict Detection",
    agent: "Consistency Agent",
    blurb:
      "The agent cross-checks all requirements for contradictions, duplications and overlaps, proposes resolutions, and closes the loop.",
    hitl: "Resolve each conflict to finish the pipeline",
  },
};

export type StageStatus =
  | "awaiting_input"
  | "agent_running"
  | "awaiting_review"
  | "approved";

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  awaiting_input: "Awaiting input",
  agent_running: "Agent running",
  awaiting_review: "Awaiting your review",
  approved: "Approved",
};

export interface EvidenceDTO {
  id: string;
  code: string;
  title: string;
  sourceType: string;
  language: string;
  content: string;
}

export interface QuestionDTO {
  id: string;
  order: number;
  text: string;
  rationale?: string | null;
  priority: string;
  answer?: string | null;
  answered: boolean;
}

export interface CandidateDTO {
  id: string;
  title: string;
  description: string;
  impact: number;
  effort: number;
  evidenceIds: string;
  selected: boolean;
}

export interface TraceLinkDTO {
  evidenceCode: string;
  note?: string | null;
}

export interface RequirementDTO {
  id: string;
  refId: string;
  text: string;
  type: string;
  priority: string;
  ambiguity: number;
  ambiguityNote?: string | null;
  suggestion?: string | null;
  language: string;
  status: string;
  order: number;
  links: TraceLinkDTO[];
}

export interface StoryDTO {
  id: string;
  refId: string;
  requirementId: string;
  title: string;
  narrative: string;
  acceptance: string;
  investScore?: number | null;
  investNote?: string | null;
  status: string;
}

export interface ConflictDTO {
  id: string;
  reqAId: string;
  reqBId: string;
  kind: string;
  description: string;
  severity: string;
  suggestion?: string | null;
  resolution?: string | null;
  status: string;
  reqA?: { refId: string; text: string };
  reqB?: { refId: string; text: string };
}

export interface ProjectDTO {
  id: string;
  name: string;
  brief: string;
  status: string;
  currentStage: Stage;
  stageStatus: StageStatus;
  isDemo: boolean;
  createdAt: string;
  evidences: EvidenceDTO[];
  questions: QuestionDTO[];
  candidates: CandidateDTO[];
  requirements: RequirementDTO[];
  stories: StoryDTO[];
  conflicts: ConflictDTO[];
  artifacts: { id: string; stage: string; createdAt: string }[];
}

export const PRIORITY_ORDER = ["Must", "Should", "Could", "Won't"] as const;

export function priorityColor(p: string): string {
  switch (p) {
    case "Must":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "Should":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "Could":
      return "bg-teal-100 text-teal-700 border-teal-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function ambiguityColor(score: number): string {
  if (score >= 60) return "bg-rose-100 text-rose-700 border-rose-200";
  if (score >= 30) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export function severityColor(s: string): string {
  if (s === "high") return "bg-rose-100 text-rose-700 border-rose-200";
  if (s === "medium") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export const LANG_LABEL: Record<string, string> = {
  en: "English",
  "ar-EG": "Egyptian Arabic",
  codeswitch: "Code-switched",
};
