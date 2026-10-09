// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — MISSION LIBRARY (seed catalog)
//
// A curated bank of fully-developed reference missions the user
// can load into their fleet with one click. Each seed carries a
// complete, realistic content pack: multilingual evidence
// (Egyptian Arabic / English / code-switch), planner-stamped
// questions, grounded requirements, stories, typed-edge graph,
// conflicts with implications, executability scenarios, decision
// journal and cost-observatory runs.
//
// Dynamicity rule: the catalog is qualitative SEED content. Once
// loaded, every number and record the UI renders comes from the
// database via the APIs — nothing here is displayed as live data.
// ─────────────────────────────────────────────────────────────

export type SeedLang = "en" | "ar-EG" | "codeswitch";

export interface SeedUtility {
  infoGain: number;
  impact: number;
  uncertainty: number;
  risk: number;
  askCost: number;
  utility: number;
}

export interface SeedEvidence {
  code: string;
  title: string;
  sourceType: "interview" | "document" | "meeting" | "survey" | "observation" | "transcript";
  language: SeedLang;
  content: string;
  consent?: boolean;
}

export interface SeedQuestion {
  text: string;
  rationale?: string;
  priority: "high" | "medium" | "low";
  askCost: number;
  fallback: string;
  utility?: SeedUtility;
  answer?: string;
  resolution?: "pending" | "answered" | "proceed_with_uncertainty";
}

export interface SeedCandidate {
  title: string;
  description: string;
  impact: number; // 1..5
  effort: number; // 1..5
  selected: boolean;
}

export interface SeedReq {
  refId: string;
  text: string;
  type: "functional" | "nonfunctional" | "constraint";
  priority: "Must" | "Should" | "Could" | "Won't";
  language?: SeedLang;
  ambiguity?: number; // 0..100
  ambiguityNote?: string;
  suggestion?: string;
  confidence?: number; // 0..100
  verify?: "supported" | "weak" | "unverified";
  verifyNote?: string;
  evidence: string[]; // evidence codes grounding this requirement
}

export interface SeedStory {
  req: string;
  refId: string;
  title: string;
  narrative: string;
  acceptance: string[];
  invest?: number; // 0..100
  status?: "draft" | "approved";
}

export interface SeedConflict {
  a: string;
  b: string;
  kind: "contradiction" | "duplication" | "overlap";
  taxonomy?: "value" | "terminology" | "scale" | "constraint" | "precedence" | "knowledge";
  description: string;
  severity: "high" | "medium" | "low";
  implications?: { option: string; impact: string }[];
  resolution?: string;
}

export interface SeedEdge {
  from: string;
  to: string;
  kind: "depends_on" | "conflicts_with" | "derived_from" | "refines" | "validates" | "affected_by";
  note?: string;
}

export interface SeedExec {
  req?: string; // requirement refId; omitted for GAP discoveries
  gapId?: string; // e.g. "GAP-01" when resolution === "undefined"
  given: string;
  when: string;
  then: string;
  resolution: "defined" | "undefined";
  undefinedReason?: string;
  discovery?: string;
}

export interface SeedDecision {
  stage: string;
  actor: "human" | "agent" | "system";
  action: string;
  detail: string;
}

export interface SeedRun {
  stage: string;
  status: "done" | "failed";
  latencyMs: number;
  estTokens: number;
  estCostUsd: number;
}

export type MissionLayout =
  | "landed" // full baseline, all gates approved
  | "briefing" // sitting in Briefing with pending questions
  | "selection" // Route Plot — problem candidates awaiting choice
  | "ambiguity" // Turbulence Scan — rewrites awaiting arbitration
  | "stories" // Payload — draft stories awaiting review
  | "clearance"; // Clearance — open conflicts awaiting negotiation

export interface MissionSeed {
  id: string;
  name: string;
  domain: string;
  domainAr: string;
  tagline: string;
  taglineAr: string;
  focus: string;
  focusAr: string;
  languages: SeedLang[];
  layout: MissionLayout;
  brief: string;
  evidences: SeedEvidence[];
  questions?: SeedQuestion[];
  candidates?: SeedCandidate[];
  requirements?: SeedReq[];
  stories?: SeedStory[];
  conflicts?: SeedConflict[];
  edges?: SeedEdge[];
  execs?: SeedExec[];
  decisions?: SeedDecision[];
  runs?: SeedRun[];
}

import { LIBRARY_A } from "@/lib/missions/library-a";
import { LIBRARY_B } from "@/lib/missions/library-b";
import { LIBRARY_C } from "@/lib/missions/library-c";

export const MISSION_LIBRARY: MissionSeed[] = [...LIBRARY_A, ...LIBRARY_B, ...LIBRARY_C];
