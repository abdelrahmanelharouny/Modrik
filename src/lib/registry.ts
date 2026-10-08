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
    id: "health",
    name: "Health Decomposer",
    nameAr: "مُفكِّك الصحة",
    icon: "HeartPulse",
    desc: "No magic single score — dimensions decomposed: ambiguity, verification confidence, uncertainty ledger, conflict pressure, traceability coverage.",
    descAr: "لا درجة سحرية واحدة — أبعاد مفككة: الغموض، ثقة التحقق، سجل عدم التأكد، ضغط التعارضات، تغطية التتبع.",
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
    desc: "Pluggable packs: WCAG 2.2 accessibility, Egypt PDPL-inspired privacy, performance & resilience — each scanned against the requirement graph.",
    descAr: "حِزَم قابلة للتركيب: إتاحة WCAG 2.2، خصوصية مستوحاة من قانون حماية البيانات المصري، والأداء والمرونة — تُفحص مقابل رسم المتطلبات.",
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
    id: "constellation",
    name: "Constellation Graph",
    nameAr: "خريطة الأبراج",
    icon: "Waypoints",
    desc: "The live requirement graph: requirements, evidence grounding links, and conflict edges — rendered as a navigable constellation.",
    descAr: "رسم المتطلبات الحي: المتطلبات وروابط الأدلة وخطوط التعارض — كخريطة أبراج قابلة للاستكشاف.",
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
    status: "ready", // registry-declared capability status (qualitative)
    desc: "Each approved requirement exports as a draft issue payload — labels carry priority and verification state, bodies carry evidence citations.",
    descAr: "كل متطلب معتمد يُصدَّر كمسودة Issue — الوسوم تحمل الأولوية وحالة التحقق، والمتن يحمل استشهادات الأدلة.",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "KanbanSquare",
    status: "ready",
    desc: "Stories map to Jira issues with acceptance criteria in the description; the requirement refId is preserved for bidirectional traceability.",
    descAr: "تُحوَّل القصص إلى Issues في Jira مع معايير القبول في الوصف، ويُحفظ معرّف المتطلب للتتبع ثنائي الاتجاه.",
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
      { name: "Critic-verifier extraction", nameAr: "الاستخراج بالناقد", status: "live", note: "Proposer + Critic roles, confidence numbers (I3)" },
      { name: "Arabic-first elicitation", nameAr: "الاستقصاء بالعربية أولاً", status: "live", note: "Egyptian Arabic, code-switching, RTL interface (N7)" },
      { name: "Voice-note intake", nameAr: "الإدخال الصوتي", status: "live", note: "In-browser recording transcribed into evidence (I5)" },
    ],
  },
  {
    group: "Trust Spine",
    groupAr: "العمود الفقري للثقة",
    blurb: "Auditability and the human decision contract",
    items: [
      { name: "Decision journal", nameAr: "سجل القرارات", status: "live", note: "Immutable, per-decision, exportable (I12)" },
      { name: "Cost observatory", nameAr: "مرصد التكاليف", status: "live", note: "Latency, tokens and blended cost per agent run (I13)" },
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
      { name: "Constraint packs", nameAr: "حِزَم القيود", status: "live", note: "WCAG 2.2 · Egypt-PDPL privacy · performance (I11)" },
      { name: "Wind tunnel", nameAr: "نفق المحاكاة", status: "live", note: "Synthetic stakeholder stress-testing (I7)" },
      { name: "Cross-model probes", nameAr: "اختبارات عابرة للنماذج", status: "in-dev", note: "Provider abstraction for model-agnostic runs (N-layer)" },
    ],
  },
  {
    group: "Journey & Delivery",
    groupAr: "الرحلة والتسليم",
    blurb: "From cockpit to trackers",
    items: [
      { name: "Flight-plan UX", nameAr: "تجربة خطة الرحلة", status: "live", note: "Journey-rail interface with human gates" },
      { name: "Baseline exports", nameAr: "تصدير خط الأساس", status: "live", note: "JSON, Gherkin skeletons, audit log" },
      { name: "GitHub Issues sync", nameAr: "مزامنة GitHub Issues", status: "in-dev", note: "Draft issue payloads ready; OAuth write-next" },
      { name: "Jira sync", nameAr: "مزامنة Jira", status: "in-dev", note: "Story→issue mapping ready; site auth-next" },
      { name: "Ablation harness UI", nameAr: "واجهة اختبار الأذرع", status: "planned", note: "4-arm Question-Planner ablation console" },
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
