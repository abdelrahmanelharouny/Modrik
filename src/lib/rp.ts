// ─────────────────────────────────────────────────────────────
// RequirementPilot — shared types, pipeline stages, i18n, helpers
// Expansion build: applies I1–I14 / G1–G14 / M1–M5 to the product.
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
  {
    index: number;
    title: string;
    titleAr: string;
    agent: string;
    agentAr: string;
    blurb: string;
    blurbAr: string;
    hitl: string;
    hitlAr: string;
  }
> = {
  ELICITATION: {
    index: 0,
    title: "Elicitation",
    titleAr: "استخلاص المتطلبات",
    agent: "Questioner Agent",
    agentAr: "وكيل الأسئلة",
    blurb:
      "The agent studies your brief, evidence and prior lessons, then raises clarifying questions — each with an ask-cost and a fallback assumption. You decide per question: answer it, or proceed with marked uncertainty.",
    blurbAr:
      "يدرس الوكيل موجز المشروع والأدلة والدروس السابقة، ثم يطرح أسئلة توضيحية — لكل سؤال تكلفة سؤال وفرضية بديلة. أنت تقرر لكل سؤال: تجيب عنه، أو تكمل مع تسجيل حالة عدم التأكد.",
    hitl: "Answer or mark “proceed with uncertainty” for each question, then approve",
    hitlAr: "أجب عن كل سؤال أو اختر «المتابعة مع عدم التأكد»، ثم وافق للمتابعة",
  },
  PROBLEM_SELECTION: {
    index: 1,
    title: "Problem Selection",
    titleAr: "اختيار المشكلة",
    agent: "Scope Agent",
    agentAr: "وكيل التحديد",
    blurb:
      "Impact-aware problem selection: the agent proposes candidate problem statements grounded in your evidence. You score impact vs. effort and pick what to pursue.",
    blurbAr:
      "اختيار المشكلات بناءً على الأثر: يقترح الوكيل مشكلات مرتبطة بأدلتك. أنت تقيّم الأثر مقابل الجهد وتختار ما ستتبعه.",
    hitl: "Score impact & effort, select one problem, then approve",
    hitlAr: "قيّم الأثر والجهد، واختر مشكلة واحدة، ثم وافق",
  },
  EXTRACTION: {
    index: 2,
    title: "Requirement Extraction",
    titleAr: "استخراج المتطلبات",
    agent: "Extraction Agent",
    agentAr: "وكيل الاستخراج",
    blurb:
      "A two-role society: the Proposer extracts atomic requirements with cited evidence and confidence; the Critic then verifies each one against the evidence spans before you arbitrate.",
    blurbAr:
      "مجتمع من دورين: المستخرِج يستخرج متطلبات ذرية موثقة بالأدلة وبدرجة ثقة، ثم يتحقق الناقد من كل متطلب مقابل شواهد الأدلة قبل أنت تحكم.",
    hitl: "Review verification verdicts, edit or remove requirements, then approve",
    hitlAr: "راجع نتائج التحقق، عدّل أو احذف المتطلبات، ثم وافق",
  },
  AMBIGUITY: {
    index: 3,
    title: "Ambiguity Analysis",
    titleAr: "تحليل الغموض",
    agent: "Ambiguity Agent",
    agentAr: "وكيل الغموض",
    blurb:
      "Every requirement is scored for ambiguity (0–100) with weak phrases flagged — including an Arabic ambiguity lexicon — and a sharper rewrite is proposed where needed.",
    blurbAr:
      "يُقيَّم كل متطلب بدرجة غموض من 0 إلى 100 مع تحديد العبارات الضعيفة — بمعجم غموض عربي كذلك — ويُقترح صياغة أوضح عند الحاجة.",
    hitl: "Accept suggested rewrites or keep originals, then approve",
    hitlAr: "اقبل الصياغات المقترحة أو أبقِ الأصلية، ثم وافق",
  },
  STORIES: {
    index: 4,
    title: "User Story Generation",
    titleAr: "توليد قصص المستخدم",
    agent: "Story Agent",
    agentAr: "وكيل القصص",
    blurb:
      "Approved requirements become user stories with Gherkin-style acceptance criteria and an INVEST quality score — ready to export as executable .feature skeletons.",
    blurbAr:
      "تتحول المتطلبات المعتمدة إلى قصص مستخدم بمعايير قبول بنمط Gherkin ودرجة جودة INVEST — جاهزة للتصدير كهياكل اختبار قابلة للتنفيذ.",
    hitl: "Review stories and acceptance criteria, then approve",
    hitlAr: "راجع القصص ومعايير القبول، ثم وافق",
  },
  CONFLICTS: {
    index: 5,
    title: "Conflict Detection",
    titleAr: "كشف التعارضات",
    agent: "Consistency Agent",
    agentAr: "وكيل الاتساق",
    blurb:
      "The agent cross-checks all requirements for contradictions, duplications and overlaps, proposes resolutions, and closes the loop with a full decision journal.",
    blurbAr:
      "يفحص الوكيل جميع المتطلبات بحثًا عن التناقضات والتكرارات والتداخلات، ويقترح حلولًا، ويُغلق الحلقة بسجل قرارات كامل.",
    hitl: "Resolve each conflict to finish the pipeline",
    hitlAr: "حُلّ كل تعارض لإنهاء المسار",
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

// ── i18n (I6 Arabic-first interaction layer) ──────────────────

export type Lang = "en" | "ar";

export const AR: Record<string, string> = {
  tagline: "قائم على الأدلة · بشري في الحلقة · وكلاء ذكيون لهندسة المتطلبات",
  heroTitle: "من أدلة فوضوية إلى خط أساس مُتطلبات قابل للدفاع عنه",
  heroSub:
    "ستة وكلاء — استخلاص، اختيار مشكلة واعٍ بالأثر، استخراج مُوثّق، تحليل غموض، توليد قصص، وكشف تعارضات — يُغلق كلًا منها بوابة موافقة بشرية تتحكم بها أنت.",
  claim1: "استقصاء مشروط بعدم التأكد",
  claim1Sub: "اسأل أو أكمل — كل افتراض مسجّل وقابل للتدقيق",
  claim2: "استخراج مُوثّق بالأدلة",
  claim2Sub: "مستخرج + ناقد، أرقام ثقة، ودعم العربية أولاً",
  claim3: "دورة حياة قابلة للمحاسبة",
  claim3Sub: "سجل قرارات، مرصد تكاليف، ورادار انحراف",
  newProject: "مشروع جديد",
  loadDemo: "حمّل المشروع التجريبي",
  howItWorks: "كيف تعمل المنصة",
  lifecycle: "دورة حياة متصلة — لا تتوقف عند المقابلة",
  projects: "مشاريعك",
  memory: "ذاكرة المنصة",
  memorySub: "دروس ومصطلحات تعلّمها RequirementPilot من المشاريع السابقة (I4)",
  assets: "أصول المنصة",
  emptyProjects: "لا توجد مشاريع بعد",
  emptyProjectsSub: "ابدأ من الصفر، أو حمّل المشروع التجريبي بأدلة بالعامية المصرية والكود-سويتشينج.",
  journal: "سجل القرارات",
  observatory: "مرصد التكاليف",
  health: "تقرير الصحة",
  backToProjects: "كل المشاريع",
  runAgent: "شغّل الوكيل",
  approve: "وافق وتابع",
  agentWorking: "الوكيل يعمل…",
  humanGate: "بوابة بشرية",
  evidence: "مكتبة الأدلة",
  questions: "أسئلة توضيحية",
  answered: "مُجاب",
  proceedUncertainty: "المتابعة مع عدم التأكد",
  askCost: "تكلفة السؤال",
  fallbackAssumption: "لو لم تُسأل: سنفترض",
  windTunnel: "نفق المحاكاة",
  answeredCount: "مُجاب",
  complete: "مكتمل",
  stage: "مرحلة",
  demo: "تجريبي",
  exportBaseline: "تصدير JSON",
  gherkin: "تصدير Gherkin",
  auditLog: "تصدير سجل التدقيق",
  driftRadar: "رادار الانحراف",
  compliance: "فحص الامتثال",
  healthReport: "تقرير صحة المتطلبات",
  regenerate: "إعادة التوليد",
  language: "العربية",
};

export function tr(lang: Lang, key: keyof typeof AR | string): string {
  if (lang === "ar" && key in AR) return AR[key];
  return key;
}

// ── DTOs ──────────────────────────────────────────────────────

export interface EvidenceDTO {
  id: string;
  code: string;
  title: string;
  sourceType: string;
  language: string;
  content: string;
  consent: boolean;
  origin: string;
}

export interface QuestionDTO {
  id: string;
  order: number;
  text: string;
  rationale?: string | null;
  priority: string;
  askCost?: number | null;
  fallbackAssumption?: string | null;
  utility?: string | null; // JSON utility breakdown from the impact-aware planner (dev item 7)
  answer?: string | null;
  answered: boolean;
  resolution: string;
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
  confidence: number;
  verifyStatus: string;
  verifyNote?: string | null;
  driftStatus: string;
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
  taxonomy?: string | null;
  description: string;
  severity: string;
  suggestion?: string | null;
  implications?: string | null; // JSON [{option, impact}] — implications-only negotiation (dev item 10)
  resolution?: string | null;
  status: string;
  reqA?: { refId: string; text: string };
  reqB?: { refId: string; text: string };
}

export interface DecisionDTO {
  id: string;
  stage: string;
  actor: string;
  action: string;
  detail: string;
  createdAt: string;
}

export interface RunDTO {
  id: string;
  stage: string;
  status: string;
  latencyMs?: number | null;
  estTokens?: number | null;
  estCostUsd?: number | null;
  promptVersion?: string | null;
  createdAt: string;
}

export interface ArtifactDTO {
  id: string;
  stage: string;
  kind: string;
  content?: string;
  createdAt: string;
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
  decisions: DecisionDTO[];
  runs: RunDTO[];
  artifacts: { id: string; stage: string; kind: string; createdAt: string }[];
}

export interface MemoryDTO {
  id: string;
  kind: string;
  term: string;
  detail: string;
  createdAt: string;
}

// Shared project-card summary — mirrors GET /api/projects exactly
// (Prisma relation names: evidences / reqs / stories).
export interface ProjectSummary {
  id: string;
  name: string;
  brief: string;
  status: string;
  currentStage: string;
  stageStatus: string;
  isDemo: boolean;
  updatedAt: string;
  _count: { evidences: number; reqs: number; stories: number };
}

// ── helpers ───────────────────────────────────────────────────

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

export function confidenceColor(c: number): string {
  if (c >= 75) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (c >= 50) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-rose-100 text-rose-700 border-rose-200";
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

export const SOURCE_LABEL: Record<string, string> = {
  interview: "Interview",
  document: "Document",
  meeting: "Meeting notes",
  survey: "Survey",
  observation: "Observation",
  transcript: "Meeting transcript",
  whiteboard_ocr: "Whiteboard OCR",
};

// Human-readable action names for the decision journal (I12)
export const ACTION_LABEL: Record<string, string> = {
  agent_run: "Agent run finished",
  agent_failed: "Agent run failed",
  approved_stage: "Stage approved",
  reopened: "Pipeline reopened",
  answered_question: "Question answered",
  proceed_with_uncertainty: "Proceeded with marked uncertainty",
  question_reopened: "Question reopened",
  synthetic_answers: "Wind tunnel simulated answers",
  selected_problem: "Problem selected",
  candidate_tuned: "Impact/effort re-scored",
  edited_requirement: "Requirement edited",
  deleted_requirement: "Requirement deleted",
  applied_rewrite: "Ambiguity rewrite applied",
  edited_story: "Story edited",
  deleted_story: "Story deleted",
  resolved_conflict: "Conflict resolved",
  added_evidence: "Evidence added",
  removed_evidence: "Evidence removed",
  pii_redacted: "PII redacted from evidence",
  consent_recorded: "Stakeholder consent recorded",
  drift_check: "Drift radar check",
  drift_cleared: "Drift flags cleared",
  compliance_check: "Constraint pack check",
  health_report: "Requirements health report generated",
  exported: "Export produced",
};
