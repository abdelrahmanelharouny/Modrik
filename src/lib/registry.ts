// ─────────────────────────────────────────────────────────────
// RequirementPilot — CENTRAL REGISTRY
// Single source of truth for every piece of qualitative UI
// metadata: journey phases, identity, integrations, feature
// atlas, disclosures. All NUMBERS and RECORDS are rendered
// from live APIs (dynamicity rule) — never hardcoded here.
// ─────────────────────────────────────────────────────────────

export const IDENTITY = {
  name: "RequirementPilot",
  codename: "MISSION CONTROL",
  tagline: "From fog to flight-ready requirements",
  taglineAr: "من ضباب الغموض إلى متطلبات جاهزة للإقلاع",
  subTagline: "Evidence-driven · Human-in-the-loop · Agentic requirements engineering",
  subTaglineAr: "قائم على الأدلة · بشري في الحلقة · وكلاء أذكياء لهندسة المتطلبات",
} as const;

// LLM disclosure — mandatory, rendered in the UI (hero, footer, debrief)
export const LLM_DISCLOSURE = {
  model: "GLM",
  provider: "Z.ai",
  line: "Powered by GLM — provided by Z.ai",
  lineAr: "يعمل بنموذج GLM — من Z.ai",
} as const;

// ── The Flight Plan: journey phases ──────────────────────────
// Mirrors the 6-stage engine + the debrief instruments bay.
// `code` maps to STAGES in lib/rp.ts (engine contract).

export interface PhaseMeta {
  code: string; // engine stage code or "DEBRIEF"
  num: string; // display ordinal
  title: string;
  titleAr: string;
  callsign: string; // flight-deck nickname
  agent: string;
  icon: string; // lucide icon name (resolved in components)
  gate: string; // human-gate description
  gateAr: string;
}

export const FLIGHT_PLAN: PhaseMeta[] = [
  {
    code: "ELICITATION",
    num: "01",
    title: "Briefing",
    titleAr: "الإحاطة",
    callsign: "Evidence Intake & Interrogation",
    agent: "Questioner Agent",
    icon: "Radio",
    gate: "Answer every question — or proceed with a recorded assumption — then approve",
    gateAr: "أجب عن كل سؤال — أو تابع بفرضية مسجّلة — ثم وافق",
  },
  {
    code: "PROBLEM_SELECTION",
    num: "02",
    title: "Route Plot",
    titleAr: "رسم المسار",
    callsign: "Impact-aware Problem Selection",
    agent: "Scope Agent",
    icon: "Route",
    gate: "Score impact vs effort and commit to one problem, then approve",
    gateAr: "قيّم الأثر مقابل الجهد واختر مشكلة واحدة، ثم وافق",
  },
  {
    code: "EXTRACTION",
    num: "03",
    title: "Airframe",
    titleAr: "بناء الهيكل",
    callsign: "Grounded Requirement Extraction",
    agent: "Extraction Agent",
    icon: "DraftingCompass",
    gate: "Arbitrate every verification verdict, edit or strike requirements, then approve",
    gateAr: "حكم على نتائج التحقق، عدّل أو احذف المتطلبات، ثم وافق",
  },
  {
    code: "AMBIGUITY",
    num: "04",
    title: "Turbulence Scan",
    titleAr: "مسح الاضطراب",
    callsign: "Ambiguity Scoring & Rewrites",
    agent: "Ambiguity Agent",
    icon: "Radar",
    gate: "Accept or reject each proposed rewrite, then approve",
    gateAr: "اقبل أو ارفض كل صياغة مقترحة، ثم وافق",
  },
  {
    code: "STORIES",
    num: "05",
    title: "Payload",
    titleAr: "الحمولة",
    callsign: "Executable User Stories",
    agent: "Story Agent",
    icon: "Package",
    gate: "Review stories and acceptance criteria, then approve",
    gateAr: "راجع القصص ومعايير القبول، ثم وافق",
  },
  {
    code: "CONFLICTS",
    num: "06",
    title: "Clearance",
    titleAr: "الإفراج",
    callsign: "Conflict Negotiation Table",
    agent: "Consistency Agent",
    icon: "GitMerge",
    gate: "Write a resolution for every conflict — the system only lays out implications",
    gateAr: "اكتب حلاً لكل تعارض — النظام يعرض النتائج المترتبة فقط",
  },
  {
    code: "DEBRIEF",
    num: "7·7",
    title: "Debrief",
    titleAr: "الجلسة الختامية",
    callsign: "Instruments, Health & Integrations",
    agent: "Instruments Bay",
    icon: "Telescope",
    gate: "Export the baseline, sync trackers, run the instrument suite",
    gateAr: "صدّر خط الأساس، زامن المتتبعات، وشغّل مجموعة الأدوات",
  },
];

// ── Telemetry labels (values always come from /api/telemetry) ─

export const TELEMETRY_LABELS = {
  missions: { label: "Missions in fleet", labelAr: "المهام في الأسطول", icon: "Rocket" },
  evidence: { label: "Evidence artifacts", labelAr: "أدلة مسجّلة", icon: "FileText" },
  requirements: { label: "Requirements tracked", labelAr: "متطلبات مُتابعة", icon: "ListChecks" },
  stories: { label: "Stories generated", labelAr: "قصص مولّدة", icon: "BookOpen" },
  decisions: { label: "Journal entries", labelAr: "قيود السجل", icon: "ScrollText" },
  conflicts: { label: "Conflicts resolved", labelAr: "تعارضات محسومة", icon: "GitMerge" },
} as const;

// ── Instrument bays (Debrief) ────────────────────────────────

export const INSTRUMENTS = [
  {
    id: "constellation",
    name: "Constellation Graph",
    nameAr: "خريطة الأبراج",
    icon: "Waypoints",
    desc: "The live requirement graph: typed edges (depends on, refines, derived from, conflicts with, validates, affected by), evidence grounding links, and impact traversal from any node.",
    descAr: "رسم المتطلبات الحي: حواف مُنوّعة (يعتمد على، يُصفّي، مشتق من، يتعارض مع، يُحقّق، يتأثر بـ) وروابط الأدلة وتتبّع الأثر من أي عقدة.",
  },
  {
    id: "planner",
    name: "Planner Lab",
    nameAr: "مختبر المُخطّط",
    icon: "Target",
    desc: "The research heart: impact-aware Question Planner. Utility = (Information Gain × Impact × Uncertainty × Risk) ÷ Ask-Cost — with a 4-arm ablation (single-shot / random / LLM / impact-aware) judged on 5 metrics.",
    descAr: "القلب البحثي: مُخطّط الأسئلة الواعي بالأثر. المنفعة = (كسب المعلومة × الأثر × عدم التأكد × الخطر) ÷ تكلفة السؤال — مع اختبار أذرع رباعي وخمسة مقاييس.",
  },
  {
    id: "health",
    name: "Health Decomposer",
    nameAr: "مُفكِّك الصحة",
    icon: "HeartPulse",
    desc: "No magic single score — six deterministic debt dimensions (ambiguity, verification, uncertainty, conflict, traceability, executability) each with per-requirement contributions, plus the LLM narrative.",
    descAr: "لا درجة سحرية واحدة — ستة أبعاد دين محسوبة حتميًا، كل بُعد بمساهمات لكل متطلب، مع السرد التحليلي للنموذج.",
  },
  {
    id: "calibration",
    name: "Calibration Panel",
    nameAr: "لوحة المعايرة",
    icon: "Scale",
    desc: "Does agent confidence mean anything? Reliability bins compare claimed confidence against critic-verifier outcomes — Brier score, calibration error, over/under-confidence verdict.",
    descAr: "هل تعني ثقة الوكيل شيئًا؟ صناديق الموثوقية تقارن الثقة المُعلنة بنتائج التحقق — درجة Brier وخطأ المعايرة وحكم الثقة الزائدة.",
  },
  {
    id: "executability",
    name: "Executability Simulator",
    nameAr: "مُحاكي التنفيذ",
    icon: "FlaskConical",
    desc: "Simulates concrete Given/When/Then scenarios against the baseline. Where the baseline is silent, the scenario is UNDEFINED — recorded as a requirement discovery, not a failure.",
    descAr: "يحاكي سيناريوهات ملموسة (بافتراض/عندما/إذًا) مقابل خط الأساس. حيث يصمت خط الأساس يُسجّل السيناريو UNDEFINED — كاكتشاف لمتطلب ناقص، لا كفشل.",
  },
  {
    id: "drift",
    name: "Drift Radar",
    nameAr: "رادار الانحراف",
    icon: "Radar",
    desc: "Feed a post-baseline change signal; the radar flags impacted requirements and records the sweep in the journal.",
    descAr: "أدخل إشارة تغيّر بعد تثبيت خط الأساس؛ يحدد الرادار المتطلبات المتأثرة ويسجّل المسح في السجل.",
  },
  {
    id: "compliance",
    name: "Constraint Pack Bay",
    nameAr: "حِزَم القيود",
    icon: "ShieldCheck",
    desc: "Pluggable packs scan the requirement graph (WCAG 2.2, Egypt PDPL privacy, performance) — and the platform audits ITSELF with deterministic checks on the same standards.",
    descAr: "حِزَم قابلة للتركيب تُفحص رسم المتطلبات (WCAG 2.2، خصوصية PDPL، الأداء) — والمنصة تُدقّق نفسها بفحوصات حتمية على المعايير ذاتها.",
  },
  {
    id: "windtunnel",
    name: "Wind Tunnel",
    nameAr: "نفق المحاكاة",
    icon: "Wind",
    desc: "Persona-conditioned synthetic stakeholder with held-out secrets stress-tests your question set before the real interview.",
    descAr: "شخصية اصطناعية بأسرار محجوبة تختبر مجموعة أسئلتك قبل المقابلة الحقيقية.",
  },
  {
    id: "journal",
    name: "Decision Journal",
    nameAr: "سجل القرارات",
    icon: "ScrollText",
    desc: "Immutable audit trail — every human and agent decision, timestamped, exportable.",
    descAr: "سجل تدقيق غير قابل للتعديل — كل قرار بشري أو آلي بزمنه، قابل للتصدير.",
  },
] as const;

// ── Integrations bay ─────────────────────────────────────────

export const INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub Issues",
    icon: "Github",
    status: "live", // registry-declared capability status (qualitative)
    desc: "Bidirectional sync: push approved requirements as issues (labels carry MoSCoW + verification state), pull open issues back for human review — every hop traced in the sync map.",
    descAr: "مزامنة ثنائية الاتجاه: ادفع المتطلبات كـ Issues واسحب الـ Issues المفتوحة للمراجعة البشرية — كل عملية مُسجّلة في خريطة المزامنة.",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "KanbanSquare",
    status: "live",
    desc: "Bidirectional sync: stories become Jira issues with acceptance criteria and preserved requirement refs; open Jira issues pull back for human curation.",
    descAr: "مزامنة ثنائية الاتجاه: القصص تصبح Issues مع معايير القبول ومعرّفات المتطلبات؛ وتُسحب الـ Issues للمراجعة البشرية.",
  },
] as const;

// ── Feature atlas (research-grade capabilities) ──────────────
// Status values are qualitative registry declarations synced
// with FEATURES_STATUS.md: "live" | "in-dev" | "planned"

export const FEATURE_ATLAS: {
  group: string;
  groupAr: string;
  blurb: string;
  items: { name: string; nameAr: string; status: "live" | "in-dev" | "planned"; note: string }[];
}[] = [
  {
    group: "Research Core",
    groupAr: "النواة البحثية",
    blurb: "The novel machinery the thesis stands on",
    items: [
      { name: "Uncertainty-gated asking", nameAr: "السؤال المشروط بعدم التأكد", status: "live", note: "Ask-cost + fallback assumption per question; assumptions ledger" },
      { name: "Impact-aware selection", nameAr: "الاختيار الواعي بالأثر", status: "live", note: "Human-tuned impact/effort with evidence grounding (N2)" },
      { name: "Question Planner (utility formula)", nameAr: "مُخطّط الأسئلة (معادلة المنفعة)", status: "live", note: "Utility = IG×Impact×Uncertainty×Risk ÷ AskCost; 4-arm ablation lab (N1)" },
      { name: "Critic-verifier extraction", nameAr: "الاستخراج بالناقد", status: "live", note: "Proposer + Critic roles, confidence numbers (I3)" },
      { name: "Arabic-first elicitation", nameAr: "الاستقصاء بالعربية أولاً", status: "live", note: "Egyptian Arabic, code-switching, RTL interface (N7)" },
      { name: "Voice-note intake", nameAr: "الإدخال الصوتي", status: "live", note: "In-browser recording transcribed into evidence (I5)" },
      { name: "Executability simulator", nameAr: "مُحاكي التنفيذ", status: "live", note: "UNDEFINED scenarios recorded as requirement discoveries" },
      { name: "Requirement graph (typed edges)", nameAr: "رسم المتطلبات (حواف مُنوّعة)", status: "live", note: "6 edge kinds + reverse impact traversal" },
    ],
  },
  {
    group: "Trust Spine",
    groupAr: "العمود الفقري للثقة",
    blurb: "Auditability and the human decision contract",
    items: [
      { name: "Decision journal", nameAr: "سجل القرارات", status: "live", note: "Immutable, per-decision, exportable (I12)" },
      { name: "Cost observatory", nameAr: "مرصد التكاليف", status: "live", note: "Latency, tokens and blended cost per agent run (I13)" },
      { name: "Calibration panel", nameAr: "لوحة المعايرة", status: "live", note: "Brier + ECE of agent confidence vs critic verdicts" },
      { name: "Artifact snapshots", nameAr: "لقاط الأثر", status: "live", note: "Every stage output frozen for audit" },
      { name: "Consent registry", nameAr: "سجل الموافقات", status: "live", note: "Per-evidence stakeholder consent (G13)" },
    ],
  },
  {
    group: "Instrumentation",
    groupAr: "الأجهزة القياسية",
    blurb: "Debrief bay instruments on the live graph",
    items: [
      { name: "Health decomposer", nameAr: "مُفكِّك الصحة", status: "live", note: "Decomposed dimensions, no magic score (I14)" },
      { name: "Drift radar", nameAr: "رادار الانحراف", status: "live", note: "Change-signal impact sweep (I8)" },
      { name: "Constraint packs", nameAr: "حِزَم القيود", status: "live", note: "WCAG 2.2 · Egypt-PDPL privacy · performance — dual role: scans requirements AND self-audits the platform" },
      { name: "Wind tunnel", nameAr: "نفق المحاكاة", status: "live", note: "Synthetic stakeholder stress-testing (I7)" },
      { name: "Provider interface", nameAr: "واجهة المزودين", status: "live", note: "Fixed strategy, swappable model: GLM (Z.ai) | Model B | local — env-driven" },
    ],
  },
  {
    group: "Journey & Delivery",
    groupAr: "الرحلة والتسليم",
    blurb: "From cockpit to trackers",
    items: [
      { name: "Flight-plan UX", nameAr: "تجربة خطة الرحلة", status: "live", note: "Journey-rail interface with human gates" },
      { name: "Baseline exports", nameAr: "تصدير خط الأساس", status: "live", note: "JSON, Gherkin skeletons, audit log" },
      { name: "GitHub Issues sync", nameAr: "مزامنة GitHub Issues", status: "live", note: "Runtime credentials; push + pull with sync-map traceability" },
      { name: "Jira sync", nameAr: "مزامنة Jira", status: "live", note: "Cloud REST v3; push + pull with sync-map traceability" },
      { name: "Ablation harness UI", nameAr: "واجهة اختبار الأذرع", status: "live", note: "4-arm Question-Planner lab live in the Debrief bay" },
      { name: "User study console", nameAr: "وحدة دراسة المستخدم", status: "live", note: "3-group NASA-TLX sessions + anonymised CSV export (protocol: docs/study-protocol.md)" },
    ],
  },
] as const;

// ── Status chip vocabulary (single vocabulary, registry-driven) ─

export const STATUS_CHIP: Record<string, { label: string; tone: string }> = {
  live: { label: "LIVE", tone: "verify" },
  "in-dev": { label: "IN DEV", tone: "signal" },
  planned: { label: "PLANNED", tone: "muted" },
  awaiting_input: { label: "AWAITING INPUT", tone: "signal" },
  agent_running: { label: "AGENT RUNNING", tone: "plasma" },
  awaiting_review: { label: "AWAITING REVIEW", tone: "signal" },
  approved: { label: "APPROVED", tone: "verify" },
  complete: { label: "BASELINE READY", tone: "verify" },
  active: { label: "IN FLIGHT", tone: "aura" },
};
