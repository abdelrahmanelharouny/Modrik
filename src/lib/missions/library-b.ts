// ─────────────────────────────────────────────────────────────
// Mission Library · Part B (4 missions)
// 6  Pharmacy Refill Reminders   — clearance (open conflicts)
// 7  Rental Portal               — landed, Cairo proptech
// 8  School Bus Safety           — selection (candidates awaiting choice)
// 9  Group-Buying Groceries      — landed, Mansoura commerce
// ─────────────────────────────────────────────────────────────
import type { MissionSeed } from "@/lib/mission-library";

export const LIBRARY_B: MissionSeed[] = [
  // ── 6 · Pharmacy Refill Reminders (clearance) ──────────────
  {
    id: "pharmacy-reminders",
    name: "Pharmacy Refill Reminders — Dokki",
    domain: "HealthTech",
    domainAr: "صحة رقمية",
    tagline: "Sitting at the negotiation table: two open conflicts, system presents — you decide",
    taglineAr: "على طاولة التفاوض: تعارضين مفتوحين — النظام يعرض وأنت بتحسم",
    focus: "refill reminders · controlled meds · consent",
    focusAr: "تذكيرات الأدوية · أدوية مراقبة · موافقات",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "clearance",
    brief:
      "A pharmacy chain wants a refill companion: patients get reminders before chronic medication runs out, " +
      "pharmacies prepare refills, and family members can proxy-pickup. Two conflicts are open at the negotiation " +
      "table (reminder channel; proxy pickup vs privacy) — the mission stops at Clearance by design.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع صيدلانية — صيدلية نقطة واحدة",
        sourceType: "interview",
        language: "codeswitch",
        content:
          "أنا عندا ٤٠٠ مريض مزمن تقريباً — ضغط وسكر وقلب. أكبر مشكلة إن المريض يخلص الدوا وميحضرش غير لما يحس بالأعراض. " +
          "الـ reminders بالـ WhatsApp بتشتغل بس ناس كتير بتسأل «إنت مين؟» وخايفين من النصب. " +
          "The controlled meds — بنص وتيامين وغيرهم — مينفعش حد ييجي ياخدها غير المريض نفسه بورقة رسمية. " +
          "عايزة الـ refill يجهز قبل ما المريض يخلص بـ ٣ أيام على الأقل.",
        consent: true,
      },
      {
        code: "E2",
        title: "Patient survey — 38 respondents",
        sourceType: "survey",
        language: "ar-EG",
        content:
          "من ٣٨ مريض: ٢٩ بيستقبلوا رسايل على الموبايل عادي، ١٤ قالوا بيستخدموا واتساب كل يوم، " +
          "٩ قالوا مش هيحطوا تطبيق جديد على الموبايل خالص. و٢٢ قالوا يفضّلوا ابنة أو ابنهم يستلم الدوا عنهم لما يشتغلوا. " +
          "و١١ أعربوا عن قلق إن «الصيدلية تعرف كل أدويتي تتباع».",
      },
      {
        code: "E3",
        title: "Regulatory note (chain pharmacist-in-charge)",
        sourceType: "document",
        language: "en",
        content:
          "Controlled/monitored medications require the patient's physical presence plus official documentation; no proxy pickup is permitted for them. " +
          "Patient medication lists are personal data under Egypt PDPL: purpose limitation applies, and family proxy access requires explicit, revocable consent. " +
          "Reminder messages must never name the medication in plaintext over SMS channels.",
      },
    ],
    questions: [
      {
        text: "Should the reminder message ever include the medication name on non-encrypted channels (SMS), or always use a neutral 'your medicine is running low' phrasing?",
        priority: "high",
        askCost: 2,
        fallback: "Assume neutral phrasing on SMS; full name only inside an authenticated app/WhatsApp session.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "نص محايد في الرسايل العادية، والاسم كامل جوه الجلسة الموثقة بس.",
        resolution: "answered",
      },
      {
        text: "How many days before exhaustion should the refill reminder fire for once-daily vs twice-daily regimens?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume 3 days for once-daily, 2 days for twice-daily.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 2, utility: 27 },
        answer: "٣ أيام لليومي، ويومين لكل ١٢ ساعة.",
        resolution: "answered",
      },
      {
        text: "For proxy pickup of non-controlled meds, is verbal consent recorded by the pharmacist sufficient, or must the patient register the proxy in advance?",
        priority: "high",
        askCost: 3,
        fallback: "Assume advance registration of named proxies with revocable consent.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 3, utility: 64 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "The system shall remind chronic patients a configurable number of days before their medication runs out (default 3 days once-daily, 2 days twice-daily).",
        type: "functional",
        priority: "Must",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "Reminder messages sent over SMS shall use neutral phrasing and shall never contain the medication name in plaintext.",
        type: "constraint",
        priority: "Must",
        ambiguity: 6,
        confidence: 95,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-03",
        text: "Controlled/monitored medications shall require the patient's physical presence with official documentation; proxy pickup is prohibited for them.",
        type: "constraint",
        priority: "Must",
        ambiguity: 5,
        confidence: 96,
        verify: "supported",
        evidence: ["E1", "E3"],
      },
      {
        refId: "REQ-04",
        text: "Patients may register named proxies for non-controlled pickup with explicit, revocable consent recorded under Egypt PDPL.",
        type: "functional",
        priority: "Must",
        ambiguity: 18,
        ambiguityNote: "Consent UX (in-app vs pharmacist-recorded) is the open conflict with REQ-05.",
        confidence: 86,
        verify: "supported",
        evidence: ["E2", "E3"],
      },
      {
        refId: "REQ-05",
        text: "Pharmacists may record verbal consent at the counter for proxy pickup, valid for the single transaction.",
        type: "functional",
        priority: "Should",
        ambiguity: 24,
        confidence: 79,
        verify: "weak",
        verifyNote: "Critic: single-transaction verbal consent conflicts with the pre-registered proxy model — see open conflict.",
        evidence: ["E1"],
      },
      {
        refId: "REQ-06",
        text: "The pharmacy dashboard shall show refills to prepare today with per-patient readiness status.",
        type: "functional",
        priority: "Should",
        ambiguity: 14,
        confidence: 88,
        verify: "supported",
        evidence: ["E1"],
      },
      {
        refId: "REQ-07",
        text: "Medication history shall be visible only to authenticated pharmacy staff and the patient; access is logged.",
        type: "nonfunctional",
        priority: "Must",
        ambiguity: 9,
        confidence: 94,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-01",
        refId: "US-01",
        title: "Warn me before the strip runs out",
        narrative:
          "As a chronic patient, I want a reminder days before my medicine runs out, so that I never skip a dose waiting for a refill.",
        acceptance: [
          "Reminder fires per regimen default (3d/2d)",
          "Message uses neutral phrasing on SMS",
        ],
        invest: 85,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-02",
        title: "My daughter can pick it up",
        narrative:
          "As a working patient, I want to register a named family proxy, so that my medicine arrives even when I am at work.",
        acceptance: [
          "Proxy registered with explicit consent",
          "Consent revocable in one step",
          "Controlled meds are excluded from proxy pickup",
        ],
        invest: 78,
        status: "approved",
      },
      {
        req: "REQ-06",
        refId: "US-03",
        title: "Today's preparation list",
        narrative:
          "As a pharmacist, I want a list of refills to prepare today, so that patients never wait while we count strips.",
        acceptance: [
          "List ordered by pickup window",
          "Each row shows readiness status",
        ],
        invest: 70,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-04",
        b: "REQ-05",
        kind: "contradiction",
        taxonomy: "value",
        description:
          "Pre-registered named proxies with explicit consent (REQ-04) versus ad-hoc verbal consent at the counter (REQ-05) give two different answers to 'who may collect' — convenience versus privacy.",
        severity: "high",
        implications: [
          { option: "Pre-registration only (REQ-04 wins)", impact: "IF pre-reg only => PDPL posture is airtight and audits are clean, but ad-hoc carers (neighbour, nurse) are blocked and counter staff bear refusal burden." },
          { option: "Verbal consent allowed (REQ-05 wins)", impact: "IF verbal allowed => maximum convenience and family goodwill, but consent trail becomes procedural and PDPL 'explicit consent' claim weakens." },
          { option: "Hybrid: verbal only for non-controlled + logged", impact: "IF hybrid => daily friction drops for common meds; audit trail keeps a per-transaction record; slightly heavier pharmacist workflow." },
        ],
      },
      {
        a: "REQ-02",
        b: "REQ-06",
        kind: "overlap",
        taxonomy: "constraint",
        description:
          "Neutral-phrasing SMS (REQ-02) collides with the dashboard-driven prep list (REQ-06): pharmacists want details in messages, privacy rules say channel determines detail.",
        severity: "medium",
        implications: [
          { option: "Channel determines detail", impact: "IF channel-first => SMS stays neutral; the dashboard and authenticated WhatsApp carry specifics; one content template set per channel." },
          { option: "One template everywhere", impact: "IF uniform => simplest ops but the dashboard loses actionable detail or SMS leaks data." },
        ],
      },
    ],
    edges: [
      { from: "REQ-01", to: "REQ-07", kind: "depends_on", note: "Reminders compute from consumption visible to authenticated roles." },
      { from: "REQ-04", to: "REQ-03", kind: "affected_by", note: "Proxy rules must not weaken the controlled-meds prohibition." },
      { from: "REQ-06", to: "REQ-01", kind: "derived_from", note: "Prep list is the pharmacy-side projection of scheduled reminders." },
    ],
    execs: [
      {
        req: "REQ-01",
        given: "a once-daily patient's supply ends Thursday",
        when: "the scheduler runs Monday morning",
        then: "a neutral-phrasing reminder fires 3 days ahead and the dashboard shows the refill as pending",
        resolution: "defined",
      },
      {
        req: "REQ-03",
        given: "a registered proxy arrives to collect a controlled medication with the patient's ID card",
        when: "the pharmacist checks eligibility",
        then: "pickup is refused; only the patient in person with documentation can collect",
        resolution: "defined",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Neutral SMS phrasing + authenticated-channel detail (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Reminder lead times per regimen (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Proxy consent model carried as assumption pending negotiation (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: refill gaps for chronic patients — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-04 tightened to name revocability and PDPL basis." },
      { stage: "STORIES", actor: "human", action: "approved_stories", detail: "3 stories approved after review." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 22300, estTokens: 5500, estCostUsd: 0.0013 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 14100, estTokens: 3800, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 30900, estTokens: 8000, estCostUsd: 0.0019 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 22100, estTokens: 5400, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18700, estTokens: 4700, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 16900, estTokens: 4300, estCostUsd: 0.001 },
    ],
  },

  // ── 7 · Rental Portal (landed) ─────────────────────────────
  {
    id: "rental-portal",
    name: "Rental Portal — Cairo Flats",
    domain: "PropTech",
    domainAr: "عقارات",
    tagline: "Listings, deposits and receipts that survive landlord-tenant frictions",
    taglineAr: "شقق وعربون وإيصالات تمنع الخناقات",
    focus: "listings · deposits · receipts",
    focusAr: "إعلانات · عربون · إيصالات",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A rental marketplace for Cairo flats where owners list directly and tenants book viewings. " +
      "The pain is informal practice: verbal deposits, no receipts, disputed annual increases. " +
      "The MVP digitises listings, viewing scheduling, deposit notes and rent receipts.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع مالك شقتين — المهندسين",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا بنعرض الشقق على جروبات فيسبوك. بيجي ميعاد معاينة واتنين يجوا في نفس الوقت. " +
          "والعربون بيأخد كاش من غير ورق — حصلت مشكلة سنة اللي فاتت. عايز حاجة تعمل إيصال بالتاريخ والمبلغ تلقائي، " +
          "وتحدد ميعاد معاينة واحد في وقت. والزيادة السنوية لازم تكون مكتوبة في العقد من الأول.",
        consent: true,
      },
      {
        code: "E2",
        title: "Tenant survey highlights",
        sourceType: "survey",
        language: "en",
        content:
          "Top tenant fears: losing the deposit without proof (68%), fake listings (54%), vague increase clauses (41%). " +
          "Tenants want floor-plan photos and exact address before visiting. A 'verified owner' signal strongly increases trust. " +
          "Most book viewings from phones in the evening.",
      },
      {
        code: "E3",
        title: "Broker feedback call",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "البروكرز مش أعداء — بس مش عايزين المنصة تلغيهم. decided: نسمح بـ owner posts و broker posts مع بعض، بس بوسم واضح. " +
          "The deposit note لازم يبقى PDF بـ timestamp ورقم دفع، مش screenshot. " +
          "كمان الـ subletting مش هنتكلم فيه في الـ MVP — تعقيد قانوني.",
      },
    ],
    questions: [
      {
        text: "What exactly does the deposit note certify — an intent to rent, or a hold on the flat? And who keeps the canonical copy?",
        priority: "high",
        askCost: 2,
        fallback: "Assume intent-to-rent with a timestamped PDF held by both parties; platform keeps the canonical record.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "نية إيجار مع إيقاف الإعلان ٤٨ ساعة، والمنصة النسخة الأصلية.",
        resolution: "answered",
      },
      {
        text: "Should the annual increase cap be a platform-enforced field in the contract, or advisory text the parties may override?",
        priority: "medium",
        askCost: 3,
        fallback: "Assume advisory default (10%) with explicit override capture.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 3, askCost: 3, utility: 36 },
        answer: "افتراضي ١٠٪ مع إمكانية تجاوز مكتوبة وموقعة.",
        resolution: "answered",
      },
      {
        text: "How is a 'verified owner' proven — utility bill, contract copy, or in-person check?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume contract copy + utility bill upload with manual spot checks.",
        utility: { infoGain: 3, impact: 3, uncertainty: 4, risk: 2, askCost: 2, utility: 36 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Owners and brokers shall publish listings marked with their role; every listing shows floor-plan photos and area before the exact address is revealed.",
        type: "functional",
        priority: "Must",
        ambiguity: 12,
        confidence: 92,
        verify: "supported",
        evidence: ["E1", "E2", "E3"],
      },
      {
        refId: "REQ-02",
        text: "Viewing slots shall be single-booking: accepting a slot locks it and notifies other interested tenants of unavailability.",
        type: "functional",
        priority: "Must",
        ambiguity: 8,
        confidence: 94,
        verify: "supported",
        verifyNote: "E1's double-booking pain directly grounded.",
        evidence: ["E1"],
      },
      {
        refId: "REQ-03",
        text: "Paying a deposit shall generate a timestamped PDF note (amount, payer, flat, payment reference) stored canonically by the platform and shareable to both parties.",
        type: "functional",
        priority: "Must",
        ambiguity: 9,
        confidence: 93,
        verify: "supported",
        evidence: ["E1", "E2", "E3"],
      },
      {
        refId: "REQ-04",
        text: "إيصال الإيجار الشهري يتولد تلقائياً بالتاريخ والمبلغ واسم المستأجر، وقابل للتحميل PDF بالعربي.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 7,
        confidence: 94,
        verify: "supported",
        evidence: ["E1"],
      },
      {
        refId: "REQ-05",
        text: "The contract editor shall include an annual-increase clause defaulting to 10% with an explicit, countersigned override path.",
        type: "functional",
        priority: "Should",
        ambiguity: 16,
        confidence: 88,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-06",
        text: "A 'verified owner' badge shall appear only after document checks; the check method is a recorded assumption (Q3).",
        type: "functional",
        priority: "Should",
        ambiguity: 28,
        ambiguityNote: "Verification method carried as assumption; weak until legal review.",
        confidence: 72,
        verify: "weak",
        verifyNote: "Critic: 'document checks' without a defined method list cannot be acceptance-tested.",
        evidence: ["E2"],
      },
      {
        refId: "REQ-07",
        text: "Subletting workflows are out of scope for the MVP.",
        type: "constraint",
        priority: "Won't",
        ambiguity: 4,
        confidence: 95,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-02",
        refId: "US-01",
        title: "One viewing, one tenant",
        narrative:
          "As a landlord, I want each viewing slot booked by exactly one tenant, so that I stop hosting crowds at my door.",
        acceptance: [
          "Slot locks on booking",
          "Other tenants see it as taken",
          "Owner can reschedule with notification",
        ],
        invest: 82,
        status: "approved",
      },
      {
        req: "REQ-03",
        refId: "US-02",
        title: "A deposit with a paper trail",
        narrative:
          "As a tenant, I want a timestamped PDF for every deposit payment, so that 'no proof' arguments end before they start.",
        acceptance: [
          "PDF generated within 1 minute of payment record",
          "Contains amount, payer, flat, reference, timestamp",
          "Both parties can download it anytime",
        ],
        invest: 86,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-03",
        title: "Receipt without a notebook",
        narrative:
          "As a tenant, I want an automatic Arabic rent receipt each month, so that my payment history is undeniable.",
        acceptance: [
          "Receipt auto-generated monthly",
          "Downloadable as PDF in Arabic",
          "History view lists all receipts",
        ],
        invest: 75,
        status: "approved",
      },
      {
        req: "REQ-01",
        refId: "US-04",
        title: "Know the flat before the visit",
        narrative:
          "As a tenant, I want floor-plan photos and area before the exact address, so that I filter out unsuitable flats without travelling.",
        acceptance: [
          "Listing requires at least 3 photos + area",
          "Address reveals only after booking a viewing",
        ],
        invest: 68,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-03",
        b: "REQ-05",
        kind: "duplication",
        taxonomy: "terminology",
        description:
          "Deposit note (REQ-03) and rent receipt (REQ-04/contract) both produce 'payment documents'; tenants confused them in testing.",
        severity: "low",
        implications: [
          { option: "Distinct artifact types", impact: "IF distinct => deposit note is one-off with hold semantics; receipt is recurring. Naming fixed in UI." },
          { option: "One document type with kind field", impact: "IF unified => simpler code, but legal readers prefer separate instruments." },
        ],
        resolution: "Distinct types with distinct names: 'Deposit note' vs 'Rent receipt'.",
      },
    ],
    edges: [
      { from: "REQ-05", to: "REQ-03", kind: "depends_on", note: "Contract clause references deposit note references." },
      { from: "REQ-02", to: "REQ-01", kind: "depends_on", note: "Viewing booking requires an address-gated listing." },
      { from: "REQ-06", to: "REQ-01", kind: "validates", note: "Badge trust depends on listing authenticity controls." },
    ],
    execs: [
      {
        req: "REQ-02",
        given: "a viewing slot exists Thursday 18:00",
        when: "tenant A books it and tenant B tries two minutes later",
        then: "tenant B sees the slot as taken and may pick another",
        resolution: "defined",
      },
      {
        req: "REQ-03",
        given: "tenant pays a 10,000 EGP deposit for flat #14",
        when: "the owner records the payment",
        then: "a timestamped PDF note is generated and visible to both parties",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a tenant with a signed contract wants to leave before the term ends",
        when: "he asks the platform what happens to his deposit",
        then: "??? — the baseline defines deposit creation but is silent on early-exit deposit handling",
        resolution: "undefined",
        undefinedReason: "No requirement covers early termination and deposit release/adjudication semantics.",
        discovery: "Should the MVP include a deposit release checklist (damages, notice period) or explicitly defer early-exit cases to offline agreement?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Deposit note = intent-to-rent + 48h listing hold; platform canonical (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Increase clause default 10% with countersigned override (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Verification method carried as assumption: documents + spot checks (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: deposit disputes without proof — impact 5, effort 2." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-06 verification method flagged weak pending legal definition." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Payment documents split into distinct named artifacts." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20900, estTokens: 5200, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13700, estTokens: 3600, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 30600, estTokens: 7900, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21600, estTokens: 5300, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18200, estTokens: 4500, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 16400, estTokens: 4100, estCostUsd: 0.001 },
    ],
  },

  // ── 8 · School Bus Safety (selection) ──────────────────────
  {
    id: "school-bus-safety",
    name: "School Bus Safety — Nasr City",
    domain: "Transport",
    domainAr: "نقل",
    tagline: "Route Plot: three candidate problems, none selected — the choice is yours",
    taglineAr: "رسم المسار: تلات مشاكل مرشحة ومحدد اختار — القرار ليك",
    focus: "child safety · notifications · driver workflow",
    focusAr: "أمان الأطفال · إشعارات · شغل السائق",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "selection",
    brief:
      "A private school wants visibility and safety for its 12-bus operation: where is the bus, who boarded, " +
      "and what do parents need to know. Three candidate problems are prepared with impact/effort signals — " +
      "the pipeline is paused at Route Plot awaiting the human commitment.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع أم تلميذة — مدينة نصر",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أخطر لحظة في يومي هي انتظار الأتوبيس الصبح. ساعات يتأخر ربع ساعة ومش عارفة أبنتي وصلت ولا لأ. " +
          "لو في رسالة «طلعت» ورسالة «وصلت المدرسة» كفاية جداً. مش محتاجة خريطة حية بتابعها — حياتي مش هتسمح.",
        consent: true,
      },
      {
        code: "E2",
        title: "Transport supervisor brief",
        sourceType: "document",
        language: "en",
        content:
          "12 buses, 18 drivers, ~640 students. Morning window 06:40–07:30. Current attendance is a paper checklist per bus; " +
          "the office learns of problems from phone calls. Two incident classes matter: child left on parked bus (critical), " +
          "and wrong-stop drop-off (serious). Drivers change occasionally; paper checklists get skipped when a substitute drives.",
      },
      {
        code: "E3",
        title: "Driver representative meeting",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "السواقين مش هيقفوا عند كل بيت يلمس الشاشة — وقت الضغط في الصبح عندهم صفر. " +
          "لو فيه تسجيل نزول/ركوب لازم يكون بلمسة واحدة أو إي-كارت. " +
          "We agreed أي حل من غير تدريب أسابيع هيتبوظ في أول أسبوع.",
      },
    ],
    questions: [
      {
        text: "Is live GPS tracking of buses a hard requirement from parents, or do state-change notifications (departed/arrived/dropped) satisfy them?",
        priority: "high",
        askCost: 2,
        fallback: "Assume state-change notifications satisfy the core need; GPS deferred.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "إشعارات كفاية كأول مرحلة، والخريطة الحية بعدين.",
        resolution: "answered",
      },
      {
        text: "What identification medium is realistic for children — RFID cards, QR laminated tags, or driver-taps-per-child?",
        priority: "high",
        askCost: 3,
        fallback: "Assume laminated QR tags tapped once per stop (not per child) in v1.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 3, utility: 64 },
        answer: "QR لكل نقطة مش لكل طفل في البداية.",
        resolution: "answered",
      },
      {
        text: "For the 'child left on bus' risk, is a post-route sweep checklist enough, or does the MVP need an occupancy sensor?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume a mandatory post-route sweep confirmation in the driver app; sensors deferred.",
        utility: { infoGain: 3, impact: 5, uncertainty: 3, risk: 4, askCost: 2, utility: 90 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    candidates: [
      {
        title: "Boarding & drop-off state notifications",
        description:
          "One-tap per stop: 'departed stop X', 'all aboard', 'arrived school'. Parents of that route get push notifications. No GPS, no per-child ID — fits the driver's zero-time constraint.",
        impact: 4,
        effort: 2,
        selected: false,
      },
      {
        title: "Post-route anti-abandonment sweep",
        description:
          "Mandatory end-of-route sweep confirmation with a photo of the empty bus; office alerted if skipped. Targets the critical incident class directly.",
        impact: 5,
        effort: 3,
        selected: false,
      },
      {
        title: "Live fleet map for the office",
        description:
          "GPS units per bus with an office dashboard. Highest operational visibility but hardware cost, install time, and driver privacy concerns.",
        impact: 3,
        effort: 5,
        selected: false,
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Notifications satisfy the core parent need (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Per-stop QR chosen over per-child ID (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Sweep-checklist adequacy carried as assumption (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "agent", action: "candidates_proposed", detail: "3 candidates prepared with impact/effort signals — human commitment pending." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 21600, estTokens: 5300, estCostUsd: 0.0013 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13400, estTokens: 3500, estCostUsd: 0.0008 },
    ],
  },

  // ── 9 · Group-Buying Groceries (landed) ────────────────────
  {
    id: "groupbuy-groceries",
    name: "Group-Buy Groceries — Mansoura",
    domain: "Commerce",
    domainAr: "تجارة",
    tagline: "Neighbourhood bulk deals with split payments that must add up",
    taglineAr: "صفقات جملة للعمارة ومصاريف لازم تتقفل صح",
    focus: "deal thresholds · split payments · pickup",
    focusAr: "حد الصفقة · تقسيم الدفع · استلام",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "Neighbourhood organisers in Mansoura aggregate neighbours' grocery orders into weekly bulk deals from wholesalers. " +
      "Money is collected in cash, quantities are split by hand, and disputes start when sums do not add up. " +
      "The MVP digitises deal creation, participation, split calculation and pickup confirmation.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع منظمة العمارة — سيدة حسن",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا بجمع طلبات العمارة من زيت ورز وسكر. الوكيل يديني سعر الجملة لو وصلنا حد معين — مثلاً ٥٠ لتر زيت. " +
          "المشكلة في التقسيم: واحد عايز نص لتر، واحد ربع. والحسبة بإيدي وبتغلط، وبعدين «مين دفع كام» تبقى معركة. " +
          "عايزة التطبيق يحسب نصيب كل واحد بالقرش، ويثبت مين استلم.",
        consent: true,
      },
      {
        code: "E2",
        title: "Wholesaler deal sheet (sample)",
        sourceType: "document",
        language: "en",
        content:
          "Deals define: product, unit price at threshold, minimum quantity for the bulk price, order window close. " +
          "Sample: sunflower oil 1L — 62 EGP at 50+ units, 70 EGP below. Payment to organiser in cash on order or on pickup. " +
          "Damaged goods must be photographed at pickup to claim replacement within 24h.",
      },
      {
        code: "E3",
        title: "Organisers' WhatsApp export (excerpts)",
        sourceType: "transcript",
        language: "codeswitch",
        content:
          "بنتفق إن الـ deal لو ماخدتش الحد الأدنى في الـ deadline يا إما تلم أو يا إما تلغي — " +
          "وطالعة مشاكل لما منعرفش مين دفع فعلاً ومين لسه. " +
          "The refund case لما الصفقة تفشل محتاج قاعدة واضحة. " +
          "كمان في واحد بيعدل طلبه ٥ مرات لحد آخر يوم — محتاجين نسخة نهائية.",
      },
    ],
    questions: [
      {
        text: "When a deal misses its minimum quantity at deadline, is it cancelled with full refunds, or auto-accepted at the higher non-bulk price if participants approve?",
        priority: "high",
        askCost: 2,
        fallback: "Assume cancellation with full refunds as the only path in MVP.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "إلغاء مع رد كامل — من غير تسعير بديل في البداية.",
        resolution: "answered",
      },
      {
        text: "How are odd splits (e.g., 0.75 L of oil) handled — round up to purchasable units, or allow sub-unit shares with organiser rounding?",
        priority: "medium",
        askCost: 3,
        fallback: "Assume shares round up to the product's smallest purchasable unit.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 2, askCost: 3, utility: 24 },
        answer: "التقريب لأصغر وحدة متاحة، والفرق على المنظم يحسمه.",
        resolution: "answered",
      },
      {
        text: "Can participants edit orders until deadline, or must edits close earlier (e.g., 12h before) to freeze the calculation?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume edits close 12h before the deal deadline.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 2, utility: 27 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Organisers shall create deals with product, unit price at threshold, minimum quantity, and order-window deadline; the deal state shows threshold progress live.",
        type: "functional",
        priority: "Must",
        ambiguity: 9,
        confidence: 94,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "Each participant's share shall be computed to the piastre from the final quantities, with sub-unit shares rounded up to the smallest purchasable unit.",
        type: "functional",
        priority: "Must",
        ambiguity: 12,
        confidence: 92,
        verify: "supported",
        verifyNote: "The core fairness rule from E1; rounding confirmed in Q2 answer.",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-03",
        text: "Order edits shall freeze 12 hours before the deal deadline, producing a final per-participant statement (recorded assumption Q3).",
        type: "functional",
        priority: "Should",
        ambiguity: 20,
        confidence: 84,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-04",
        text: "لو الصفقة ماوصلتش للحد الأدنى في معادها، تتلغي وكل المشاركين ياخدوا رد كامل تلقائياً.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 6,
        confidence: 95,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-05",
        text: "Pickup confirmation shall record per-participant receipt with a photo option; damage claims require a photo within 24 hours.",
        type: "functional",
        priority: "Should",
        ambiguity: 14,
        confidence: 88,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-06",
        text: "Deal quantities shall respect wholesaler minimums; deals below threshold cannot be marked shipped.",
        type: "constraint",
        priority: "Must",
        ambiguity: 5,
        confidence: 95,
        verify: "supported",
        evidence: ["E2"],
      },
    ],
    stories: [
      {
        req: "REQ-02",
        refId: "US-01",
        title: "Split to the piastre",
        narrative:
          "As an organiser, I want each participant's share computed exactly, so that 'who paid what' never becomes a fight.",
        acceptance: [
          "Final statement lists each participant's amount",
          "Sub-unit shares round up to purchasable units",
          "Statement is visible before pickup day",
        ],
        invest: 87,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-02",
        title: "Failed deal refunds itself",
        narrative:
          "As a participant, I want automatic full refund when a deal misses its threshold, so that my money is never stuck.",
        acceptance: [
          "Cancellation triggers at deadline automatically",
          "Every participant sees refund status",
        ],
        invest: 78,
        status: "approved",
      },
      {
        req: "REQ-05",
        refId: "US-03",
        title: "Pickup proof",
        narrative:
          "As a participant, I want my pickup recorded with an optional photo, so that damage claims have evidence within 24 hours.",
        acceptance: [
          "Pickup marks me as served with timestamp",
          "Photo optional but claim requires one",
        ],
        invest: 66,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-02",
        b: "REQ-03",
        kind: "overlap",
        taxonomy: "precedence",
        description:
          "Exact split computation (REQ-02) depends on frozen quantities; late edits (REQ-03 window) would invalidate computed shares. Precedence of 'final statement' vs 'one more edit' was open.",
        severity: "medium",
        implications: [
          { option: "Freeze wins after edit-close", impact: "IF freeze-first => statements are stable for pickup; late edits spawn a new deal request instead." },
          { option: "Edits always allowed until deadline", impact: "IF edit-first => statements recompute constantly and participants lose a stable number to prepare cash." },
        ],
        resolution: "Freeze-first: after edit-close the statement is final; late changes create a new deal. Recorded as the precedence rule.",
      },
    ],
    edges: [
      { from: "REQ-02", to: "REQ-01", kind: "depends_on", note: "Splits compute from deal quantities." },
      { from: "REQ-03", to: "REQ-02", kind: "affected_by", note: "Edit freeze determines when splits become final." },
      { from: "REQ-04", to: "REQ-01", kind: "depends_on", note: "Cancellation logic reads threshold progress." },
      { from: "REQ-05", to: "REQ-02", kind: "validates", note: "Pickup confirmation checks served shares against final statement." },
    ],
    execs: [
      {
        req: "REQ-04",
        given: "an oil deal closes at 46 of 50 units",
        when: "the deadline passes",
        then: "the deal cancels and all 46 participants see full refund status",
        resolution: "defined",
      },
      {
        req: "REQ-02",
        given: "3 participants ordered 2L, 0.75L and 1.25L of oil",
        when: "the deal closes above threshold",
        then: "shares show 2L, 1L (rounded up), 1.5L with piastre amounts computed on final units",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a participant paid cash but did not collect at pickup day",
        when: "the organiser closes the pickup window",
        then: "??? — the baseline is silent on unclaimed paid orders",
        resolution: "undefined",
        undefinedReason: "No requirement defines custody, storage duration or refund path for paid-but-unclaimed orders.",
        discovery: "Should unclaimed paid orders be held 48h with a reminder, then refunded automatically with the organiser keeping storage notes?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Failed deals cancel with full refunds (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Rounding to smallest purchasable unit (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Edit-freeze window carried as assumption: 12h (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: split disputes in cash group-buying — impact 4, effort 2." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-03 gained an explicit final-statement notion." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Freeze-first precedence fixed between edits and statements." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20800, estTokens: 5100, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13600, estTokens: 3600, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 30100, estTokens: 7800, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21500, estTokens: 5300, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18100, estTokens: 4500, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 16700, estTokens: 4200, estCostUsd: 0.001 },
    ],
  },
];
