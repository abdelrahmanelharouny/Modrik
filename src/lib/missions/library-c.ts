// ─────────────────────────────────────────────────────────────
// Mission Library · Part C (4 missions)
// 10 Government Services Kiosk    — landed, govtech + WCAG focus
// 11 Gym Membership Pass          — stories (draft stories awaiting review)
// 12 Wedding Hall Booking         — landed, events
// 13 Neighborhood Complaints Line — ambiguity (rewrites awaiting arbitration)
// ─────────────────────────────────────────────────────────────
import type { MissionSeed } from "@/lib/mission-library";

export const LIBRARY_C: MissionSeed[] = [
  // ── 10 · Government Services Kiosk (landed) ────────────────
  {
    id: "gov-services-kiosk",
    name: "Government Services Kiosk — District Office",
    domain: "GovTech",
    domainAr: "خدمات حكومية",
    tagline: "Self-service kiosks that must pass WCAG before a citizen ever touches them",
    taglineAr: "كشاكيل خدمة لازم تعدّي معايير الوصول قبل أول مواطن",
    focus: "accessibility · identity · privacy wipe",
    focusAr: "وصول شامل · هوية · مسح الخصوصية",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A district office wants self-service kiosks for renewals and certificate requests, cutting queue times. " +
      "Users include elderly and low-vision citizens. WCAG 2.2 compliance is a hard constraint, identity is national-ID based, " +
      "and shared devices demand a privacy wipe story. The baseline landed with accessibility requirements pinned as Must.",
    evidences: [
      {
        code: "E1",
        title: "ملاحظة ميدانية على الكشك التجريبي (مراقبة)",
        sourceType: "observation",
        language: "ar-EG",
        content:
          "قاعدت نص ساعة جنب الكشك. كبير في السن وقف قدامه، الخط صغير والشاشة عالية، سأل موظف يساعده. " +
          "اتنين استخدموا بصمتهم غلط، واحد سابي الصفحة بتاعته مفتوحة وطلع. محدش سمع أي صوت من الجهاز — " +
          "اللي مش بيعرف يقرأ كويس اتلخبط. موظفة قالت «لو في صوت يقول الخطوة اللي بعدها كان هيرتاح الناس».",
        consent: true,
      },
      {
        code: "E2",
        title: "Accessibility & security specification",
        sourceType: "document",
        language: "en",
        content:
          "WCAG 2.2 AA is contractual: 4.5:1 contrast minimum, full keyboard/reachability operation, screen-reader support for every flow, " +
          "timeouts extendable on request with warning. National ID scan via NFC where available. Session data must be wiped on idle timeout (90s) and on session end; " +
          "printed tickets contain no personal data beyond the queue number. Voice guidance in Arabic is required for every step.",
      },
      {
        code: "E3",
        title: "Office manager sync",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "أهم حاجة عندنا إن الموظف يقدر يتدخل من غير ما يقف من مكانه — remote assistance للكشك الواحد. " +
          "الطابور لازم يطبع تذكرة من غير اسم — بس برقم. الـ error cases لازم ليها إيصال عشان الموضوع ميتكررش. " +
          "We agreed the kiosk must survive paper jams — يكمل شغل لو الطابور وقع.",
      },
    ],
    questions: [
      {
        text: "Should voice guidance auto-start for every session, or activate on request / on detected non-progress?",
        priority: "high",
        askCost: 2,
        fallback: "Assume auto-start with immediate mute button; non-progress prompts after 30s idle.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 2, utility: 96 },
        answer: "يبدأ صوت تلقائي مع زر كتم فوري، وتنبيه بعد ٣٠ ثانية سكون.",
        resolution: "answered",
      },
      {
        text: "For low-vision users, is a physical zoom control needed, or does software scaling to 200% satisfy the flow?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume software scaling to 200% with high-contrast theme.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 2, askCost: 2, utility: 36 },
        answer: "تكبير للـ ٢٠٠٪ + ثيم عالي التباين.",
        resolution: "answered",
      },
      {
        text: "What does the kiosk do when the queue printer jams mid-session — continue paperless with an SMS ticket, or force staff intervention?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume paperless continuation with an optional SMS ticket.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 3, askCost: 2, utility: 40 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Every kiosk flow shall satisfy WCAG 2.2 AA: contrast at least 4.5:1, full keyboard operation, and screen-reader support on all steps.",
        type: "constraint",
        priority: "Must",
        ambiguity: 6,
        confidence: 96,
        verify: "supported",
        verifyNote: "Contractual constraint from E2; audited by the platform's own constraint pack.",
        evidence: ["E2"],
      },
      {
        refId: "REQ-02",
        text: "Arabic voice guidance shall announce every step, auto-start with an immediate mute control, and prompt after 30 seconds of inactivity.",
        type: "functional",
        priority: "Must",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-03",
        text: "All session data shall be wiped automatically at 90-second idle timeout and at session end; printed tickets shall contain no personal data.",
        type: "constraint",
        priority: "Must",
        ambiguity: 8,
        confidence: 95,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-04",
        text: "تحديد الهوية يتم بمسح البطاقة عبر NFC عند توفرها، أو إدخال الرقم القومي بلوحة أرقام كبيرة.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 12,
        confidence: 92,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-05",
        text: "Staff shall remotely assist a kiosk session (view-only with citizen consent) without leaving their desk.",
        type: "functional",
        priority: "Should",
        ambiguity: 18,
        ambiguityNote: "Assistance scope (view-only vs control) fixed to view-only after review.",
        confidence: 87,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-06",
        text: "The kiosk shall continue the current session paperless when the queue printer jams, offering an optional SMS ticket.",
        type: "nonfunctional",
        priority: "Should",
        ambiguity: 22,
        ambiguityNote: "Carried as a recorded assumption (Q3) — SMS availability per citizen unverified.",
        confidence: 80,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-07",
        text: "Request errors shall print (or show) an error receipt with a reference code for follow-up.",
        type: "functional",
        priority: "Should",
        ambiguity: 13,
        confidence: 89,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-02",
        refId: "US-01",
        title: "The kiosk talks you through",
        narrative:
          "As an elderly citizen, I want voice guidance announcing each step from the start, so that I can finish without asking a stranger for help.",
        acceptance: [
          "Audio starts automatically and can be muted in one tap",
          "Inactivity prompt after 30 seconds",
          "All steps announced in Egyptian Arabic",
        ],
        invest: 83,
        status: "approved",
      },
      {
        req: "REQ-03",
        refId: "US-02",
        title: "Nothing of mine stays behind",
        narrative:
          "As a citizen on a shared device, I want my session data wiped when I leave or idle out, so that the next person sees nothing of mine.",
        acceptance: [
          "Wipe executes at 90s idle and at session end",
          "Tickets show queue number only",
        ],
        invest: 80,
        status: "approved",
      },
      {
        req: "REQ-05",
        refId: "US-03",
        title: "A helping hand from the desk",
        narrative:
          "As a staff member, I want to view a citizen's stuck screen (with their consent) from my desk, so that I can guide them without walking over.",
        acceptance: [
          "Assistance starts only after on-screen citizen consent",
          "Staff view is read-only",
        ],
        invest: 64,
        status: "approved",
      },
      {
        req: "REQ-06",
        refId: "US-04",
        title: "Printer jammed? Keep going",
        narrative:
          "As a citizen, I want my session to continue paperless if the printer jams, so that a hardware fault does not waste my visit.",
        acceptance: [
          "Session continues without printing",
          "Optional SMS ticket offered",
        ],
        invest: 61,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-02",
        b: "REQ-03",
        kind: "overlap",
        taxonomy: "value",
        description:
          "Voice guidance for everyone (REQ-02) competes with privacy on a shared device (REQ-03): spoken summaries can leak personal data to bystanders.",
        severity: "medium",
        implications: [
          { option: "Voice never reads personal values", impact: "IF generic voice => privacy preserved; the screen (with scaling) carries personal detail; low-vision users need larger type." },
          { option: "Voice reads everything", impact: "IF full voice => best autonomy for blind users, but names/amounts are audible to the queue — PDPL sensitivity rises." },
        ],
        resolution: "Voice is generic by default ('your request is saved'); personal values render only on screen at up to 200% scaling. Headset jack reserved for a future revision.",
      },
    ],
    edges: [
      { from: "REQ-02", to: "REQ-01", kind: "depends_on", note: "Voice guidance must meet the same WCAG bar." },
      { from: "REQ-05", to: "REQ-03", kind: "affected_by", note: "Remote view must respect the wipe policy (no data retention)." },
      { from: "REQ-07", to: "REQ-06", kind: "derived_from", note: "Error receipts generalize the paperless fallback." },
    ],
    execs: [
      {
        req: "REQ-03",
        given: "a citizen abandons a session mid-form",
        when: "90 seconds pass with no input",
        then: "the kiosk wipes session data and returns to the welcome screen",
        resolution: "defined",
      },
      {
        req: "REQ-06",
        given: "the queue printer jams while a citizen requests a certificate",
        when: "the session reaches the ticket step",
        then: "the kiosk continues paperless and offers an optional SMS ticket",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a citizen with no mobile phone completes a paperless session",
        when: "the kiosk offers the SMS ticket option",
        then: "??? — the baseline is silent on how this citizen gets any proof of submission",
        resolution: "undefined",
        undefinedReason: "No requirement defines a non-print, non-SMS proof path for paperless sessions.",
        discovery: "Should the desk print a reference stub on demand as the offline proof path for paperless sessions?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Voice auto-start + mute + 30s prompt (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Software scaling 200% + high-contrast theme (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Paperless fallback carried as assumption (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: accessibility failures excluding vulnerable citizens — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-05 assistance scope fixed to view-only." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Voice privacy rule: generic audio, personal detail on screen only." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 21200, estTokens: 5200, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13800, estTokens: 3600, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 30800, estTokens: 8000, estCostUsd: 0.0019 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21900, estTokens: 5400, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18300, estTokens: 4600, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 17000, estTokens: 4300, estCostUsd: 0.001 },
    ],
  },

  // ── 11 · Gym Membership Pass (stories stage) ───────────────
  {
    id: "gym-membership-pass",
    name: "Gym Membership Pass — Heliopolis",
    domain: "Fitness",
    domainAr: "لياقة",
    tagline: "Payload: draft stories awaiting your review before Clearance",
    taglineAr: "الحمولة: قصص مسوّدة مستنينة مراجعتك",
    focus: "class booking · freeze · attendance caps",
    focusAr: "حجز الحصص · تجميد الاشتراك · إشغال",
    languages: ["codeswitch", "en", "ar-EG"],
    layout: "stories",
    brief:
      "A mid-size gym wants a members' companion: book classes, freeze memberships during travel, and control peak-hour crowding. " +
      "The pipeline flew through Extraction and Ambiguity; three draft stories sit in the Payload bay awaiting review.",
    evidences: [
      {
        code: "E1",
        title: "Member interview — evening-rush regular",
        sourceType: "interview",
        language: "codeswitch",
        content:
          "بحجز كلاس الـ spinning من الجروب، وبيلغوا عليه من غير تنسيق. عايز booking حقيقي بعرف منه أنا في ولا لأ. " +
          "وبسافر شهر — الاشتراك بيفضل بيضيع عليا. الـ freeze لازم يكون من التطبيق مش مع验证 الريسبشن. " +
          "Peak hours الـ ٧ مساءً الزحمة بتخلي أقلب وأرجع.",
        consent: true,
      },
      {
        code: "E2",
        title: "Owner operations sheet",
        sourceType: "document",
        language: "en",
        content:
          "Capacity: 40 members/class; spinning room 18 bikes. Peak 18:00–21:00 averages 85% floor occupancy. " +
          "Freeze policy draft: max 30 days/year, in 7-day blocks, medical freezes unlimited with a certificate. " +
          "No-show penalty draft: 3 no-shows in a month = 7-day booking suspension. Guest passes: 2/month for annual plans.",
      },
    ],
    questions: [
      {
        text: "Should booking open to all members simultaneously, or staggered by plan tier (annual first)?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume simultaneous open with waitlist.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 2, utility: 27 },
        answer: "فتح للكل في نفس الوقت مع waitlist.",
        resolution: "answered",
      },
      {
        text: "Does a medical freeze require in-app certificate upload, or front-desk verification suffices?",
        priority: "low",
        askCost: 2,
        fallback: "Assume front-desk verification records the freeze; uploads later.",
        utility: { infoGain: 2, impact: 2, uncertainty: 2, risk: 2, askCost: 2, utility: 4 },
        answer: "الريسبشن يعتمدها يدوياً حالياً.",
        resolution: "answered",
      },
      {
        text: "What counts as a 'no-show' — not scanning in within 10 minutes of class start?",
        priority: "high",
        askCost: 2,
        fallback: "Assume 10-minute scan window defines attendance.",
        utility: { infoGain: 4, impact: 4, uncertainty: 3, risk: 3, askCost: 2, utility: 72 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Members shall book, cancel, or join a waitlist for classes with real-time capacity display.",
        type: "functional",
        priority: "Must",
        ambiguity: 8,
        confidence: 94,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "Members shall freeze their membership in 7-day blocks up to 30 days/year; medical freezes are unlimited with front-desk verification.",
        type: "functional",
        priority: "Must",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-03",
        text: "The app shall show live floor occupancy for the current hour and suggest quieter slots.",
        type: "functional",
        priority: "Should",
        ambiguity: 20,
        ambiguityNote: "'Quieter' needs a defined threshold (e.g., below 60% occupancy).",
        suggestion: "Define quiet slot as occupancy below 60% in the same weekday-hour band over the past 14 days.",
        confidence: 85,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-04",
        text: "Attendance scans within 10 minutes of class start count as attended; otherwise a no-show is recorded (assumption Q3).",
        type: "functional",
        priority: "Should",
        ambiguity: 16,
        confidence: 86,
        verify: "supported",
        evidence: ["E2"],
      },
    ],
    stories: [
      {
        req: "REQ-01",
        refId: "US-01",
        title: "A booking that means something",
        narrative:
          "As a member, I want to book a class and see my seat confirmed, so that 'the group said it's full' never decides my evening.",
        acceptance: [
          "Booking reflects real-time capacity",
          "Waitlist promotes automatically on cancellation",
          "Cancellation possible up to 2h before class",
        ],
        invest: 82,
        status: "draft",
      },
      {
        req: "REQ-02",
        refId: "US-02",
        title: "Freeze while I travel",
        narrative:
          "As a travelling member, I want to freeze my membership from the app in 7-day blocks, so that I don't pay for weeks I'm away.",
        acceptance: [
          "Freeze blocks of 7 days up to 30 days/year",
          "Remaining allowance visible",
          "Medical freeze path distinct with verification",
        ],
        invest: 76,
        status: "draft",
      },
      {
        req: "REQ-03",
        refId: "US-03",
        title: "Beat the 7 PM crush",
        narrative:
          "As a member, I want to see how crowded the floor is now and get quieter slot suggestions, so that my workout isn't queueing for a bench.",
        acceptance: [
          "Live occupancy for the current hour",
          "Suggestions show slots below 60% occupancy",
        ],
        invest: 58,
        status: "draft",
      },
    ],
    edges: [
      { from: "REQ-04", to: "REQ-01", kind: "depends_on", note: "No-show logic reads class bookings." },
      { from: "REQ-03", to: "REQ-01", kind: "derived_from", note: "Occupancy suggestions derive from booking patterns." },
    ],
    execs: [
      {
        req: "REQ-02",
        given: "a member has used 14 freeze days this year",
        when: "he requests a 21-day travel freeze",
        then: "the request is limited to his remaining 16 days with a clear message",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a member is on the waitlist and a spot opens 30 minutes before class",
        when: "promotion happens",
        then: "??? — the baseline is silent on how late promotions are accepted or declined",
        resolution: "undefined",
        undefinedReason: "No requirement defines the late-promotion acceptance window or auto-decline behaviour.",
        discovery: "Should late promotions (under 1h before class) auto-confirm with a reminder, or expire silently if unanswered in 15 minutes?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Simultaneous booking with waitlist (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Front-desk medical freeze verification (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "No-show definition carried as assumption: 10-minute scan window (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: fake bookings and peak crowding — impact 4, effort 2." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-03 'quieter' quantified at 60% occupancy." },
      { stage: "STORIES", actor: "agent", action: "stories_drafted", detail: "3 draft stories generated — human review pending." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20500, estTokens: 5000, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13300, estTokens: 3500, estCostUsd: 0.0008 },
      { stage: "EXTRACTION", status: "done", latencyMs: 29400, estTokens: 7600, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21000, estTokens: 5200, estCostUsd: 0.0012 },
      { stage: "STORIES", status: "done", latencyMs: 17800, estTokens: 4400, estCostUsd: 0.001 },
    ],
  },

  // ── 12 · Wedding Hall Booking (landed) ─────────────────────
  {
    id: "wedding-hall-booking",
    name: "Wedding Hall Booking — Cairo",
    domain: "Events",
    domainAr: "مناسبات",
    tagline: "Dates, deposits and menu tastings — the happiest pipeline on the platform",
    taglineAr: "مواعيد وعربون وتدوق قوائم — أسعد رحلة على المنصة",
    focus: "date calendar · deposit schedule · capacity caps",
    focusAr: "تقويم المواعيد · جدول العربون · سعة القاعة",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A wedding hall group manages three venues with overlapping bookings, seasonal pricing and vendor chaos. " +
      "Couples book dates, pay deposits on a schedule, and coordinate with caterers and decorators. " +
      "The landed baseline focuses on availability truth and deposit clarity.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع عروسين — حجز صالة الزهرة",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا كنت بحجز من غير ما أعرف لو التاريخ فاضي فعلاً — بيجاوبني البشر. " +
          "والعربون ٣٠٪ مرة و٥٠٪ مرة تانية — مفيش قاعدة. عايز أعرف التقويم بنفسي وأدفع بالمراحل وأفهم إيه اللي بيدفعه. " +
          "وتدوق الاكل لازم يكون ميعاد ثابت قبل الفرح بشهر على الأقل.",
        consent: true,
      },
      {
        code: "E2",
        title: "Halls group policy manual",
        sourceType: "document",
        language: "en",
        content:
          "Three venues (Al-Zahra 600, Al-Oruba 350, Nile Terrace 220 guests). Fire-safety occupancy caps are legal maxima and non-negotiable. " +
          "Deposit schedule: 30% on booking, 40% at 60 days before, 30% at 14 days before. Menu tasting slots run monthly, bookable once per contract. " +
          "Vendors (caterer, decorator, sound) coordinate through the hall; each has an assigned day-window.",
      },
      {
        code: "E3",
        title: "Planning team notes",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "اتفقنا إن الـ calendar هو المصدر — مفيش حجز بالتليفون من غير تسجيل في النظام. " +
          "الـ vendor coordination board لازم يورّي كل vendor يومه ووقته. " +
          "Weather postponement للـ Nile Terrace مش هنحسمه في الـ MVP — تعقيد تعاقدي.",
      },
    ],
    questions: [
      {
        text: "When two couples want the same date at the same venue, what breaks the tie — deposit order, in-person visit order, or a 48h soft-hold rule?",
        priority: "high",
        askCost: 2,
        fallback: "Assume 48h soft-hold after first contact, then first completed deposit wins.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "حجز مبدئي ٤٨ ساعة، وأول عربون كامل يكسب.",
        resolution: "answered",
      },
      {
        text: "May the deposit schedule shift for early bookings (e.g., 9 months ahead), or is it fixed for all?",
        priority: "medium",
        askCost: 3,
        fallback: "Assume fixed schedule for MVP.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 3, utility: 18 },
        answer: "ثابت للكل في البداية.",
        resolution: "answered",
      },
      {
        text: "What proof does a couple get per payment, and does it reference the remaining schedule?",
        priority: "low",
        askCost: 2,
        fallback: "Assume a receipt per payment listing remaining instalments.",
        utility: { infoGain: 2, impact: 3, uncertainty: 2, risk: 2, askCost: 2, utility: 6 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "The calendar shall be the single source of truth: every booking, soft-hold and payment is reflected in venue availability in real time.",
        type: "functional",
        priority: "Must",
        ambiguity: 8,
        confidence: 95,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-02",
        text: "A 48-hour soft-hold applies after first contact; the first fully-paid deposit converts the soft-hold to a confirmed booking, overriding other soft-holds.",
        type: "functional",
        priority: "Must",
        ambiguity: 12,
        confidence: 92,
        verify: "supported",
        verifyNote: "Tie-break rule confirmed in Q1 answer.",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-03",
        text: "Venue capacity shown to couples shall never exceed the legal fire-safety occupancy cap for that venue.",
        type: "constraint",
        priority: "Must",
        ambiguity: 4,
        confidence: 97,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-04",
        text: "الدفعة بتتسجل بمرحلتها (٣٠٪ / ٤٠٪ / ٣٠٪) ويطلع إيصال بيوضح المتبقي وجدول الدفع كله.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-05",
        text: "Each contract shall include one bookable menu-tasting slot at least 30 days before the event date.",
        type: "functional",
        priority: "Should",
        ambiguity: 9,
        confidence: 91,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-06",
        text: "A vendor coordination board shall show each vendor's assigned day-window per event.",
        type: "functional",
        priority: "Should",
        ambiguity: 14,
        confidence: 87,
        verify: "supported",
        evidence: ["E2", "E3"],
      },
      {
        refId: "REQ-07",
        text: "Weather-related postponement handling for outdoor venues is out of scope for the MVP.",
        type: "constraint",
        priority: "Won't",
        ambiguity: 5,
        confidence: 94,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-01",
        refId: "US-01",
        title: "The calendar never lies",
        narrative:
          "As an engaged couple, I want to see real availability myself, so that 'the phone person said it's free' never happens again.",
        acceptance: [
          "Availability reflects soft-holds and confirmed bookings live",
          "Three venues selectable with capacities",
        ],
        invest: 84,
        status: "approved",
      },
      {
        req: "REQ-02",
        refId: "US-02",
        title: "First deposit wins — visibly",
        narrative:
          "As a couple, I want the 48h soft-hold rule applied transparently, so that losing a date has a reason I can see.",
        acceptance: [
          "Soft-hold shows its expiry countdown",
          "Conversion on full deposit is instant and notified",
        ],
        invest: 74,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-03",
        title: "Every payment has a paper trail",
        narrative:
          "As a couple, I want a receipt per instalment showing what remains, so that both families trust the schedule.",
        acceptance: [
          "Receipt shows stage, amount, remaining schedule",
          "Downloadable in Arabic",
        ],
        invest: 70,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-02",
        b: "REQ-03",
        kind: "overlap",
        taxonomy: "scale",
        description:
          "Guest-count flexibility in booking (REQ-02 flow) presses against the fixed fire-safety cap (REQ-03) when families inflate guest lists late.",
        severity: "medium",
        implications: [
          { option: "Hard cap enforced at contract", impact: "IF cap hard => legal compliance guaranteed; late guest additions are refused with a clear message." },
          { option: "Soft warning at cap", impact: "IF warning only => happier families in the moment, serious legal exposure on the night." },
        ],
        resolution: "Hard cap enforced from contract signature; additions beyond cap are refused in-app. Legal note recorded.",
      },
    ],
    edges: [
      { from: "REQ-02", to: "REQ-01", kind: "depends_on", note: "Soft-hold state machine lives on the calendar." },
      { from: "REQ-04", to: "REQ-02", kind: "depends_on", note: "Deposit stage recording drives conversion." },
      { from: "REQ-05", to: "REQ-01", kind: "affected_by", note: "Tasting slots consume calendar windows." },
      { from: "REQ-03", to: "REQ-02", kind: "validates", note: "Capacity validation guards the booking flow." },
    ],
    execs: [
      {
        req: "REQ-02",
        given: "couple A holds a soft-hold on Al-Zahra for Oct 15",
        when: "couple B pays the full 30% deposit for Oct 15 before A converts",
        then: "B's booking confirms, A's soft-hold releases with a notification and alternative dates",
        resolution: "defined",
      },
      {
        req: "REQ-03",
        given: "Al-Zahra's legal cap is 600 guests",
        when: "a couple edits guest count from 590 to 620 after signing",
        then: "the edit is refused with the cap stated",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a couple paid 70% and cancels 40 days before the event",
        when: "they request the refund policy",
        then: "??? — the baseline defines the payment schedule but is silent on cancellation refunds",
        resolution: "undefined",
        undefinedReason: "No requirement defines refund tiers relative to cancellation timing.",
        discovery: "Should the contract include a cancellation refund ladder (e.g., 90/60/30-day tiers), and who signs off on it?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "48h soft-hold then first deposit wins (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Deposit schedule fixed for MVP (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Receipt contents carried as assumption: per-payment receipt with remaining schedule (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: availability truth across three venues — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-01 pinned 'single source of truth' wording." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Capacity cap enforced hard from signature." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20700, estTokens: 5100, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13500, estTokens: 3500, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 29800, estTokens: 7700, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21300, estTokens: 5300, estCostUsd: 0.0012 },
      { stage: "STORIES", status: "done", latencyMs: 18000, estTokens: 4500, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 16800, estTokens: 4200, estCostUsd: 0.001 },
    ],
  },

  // ── 13 · Neighborhood Complaints Line (ambiguity) ──────────
  {
    id: "complaints-line",
    name: "Neighborhood Complaints Line — Shubra",
    domain: "CivicTech",
    domainAr: "تقنية مدنية",
    tagline: "Turbulence Scan: two rewrites need your arbitration before takeoff",
    taglineAr: "مسح الاضطراب: صياغتان محتاجتان حكمك قبل الإقلاع",
    focus: "reporting flow · triage · anonymity",
    focusAr: "بلاغات · تصنيف · إخفاء الهوية",
    languages: ["ar-EG", "en"],
    layout: "ambiguity",
    brief:
      "A district wants a complaints line where residents report broken lights, water leaks and waste issues. " +
      "Reports are triaged to municipal teams. The pipeline is in the Turbulence Scan: extraction produced two " +
      "highly ambiguous requirements whose rewrites await human arbitration.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع مقيمة — شبرا",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "بليّغ عن انقطاع المياه من أسبوع، محدش رد. المرة اللي فاتت سألوني اسمي وعنواني بالتفصيل وأنا خايفة — " +
          "الجيران هيعرفوا مين بلّغ. عايزة أبلّغ من غير اسم وييجيلي رقم بلاغ أتابعه بيه. " +
          "وكمان البلاغات بتضيع — واحد بيبلّغ عشر مرات لنفس الحاجة.",
        consent: true,
      },
      {
        code: "E2",
        title: "Municipality triage memo",
        sourceType: "document",
        language: "en",
        content:
          "Teams: lighting, water, waste, roads. Target first-response: 72 hours. Duplicate detection matters — the same broken light " +
          "arrives 5–10 times monthly. Anonymous reports are permitted but slow unresolvable ones; a follow-up code (not identity) is issued for tracking. " +
          "Photos accelerate triage and are optional.",
      },
    ],
    questions: [
      {
        text: "For duplicate detection, what counts as 'the same issue' — same category within N metres, same landmark text, or manual moderator choice?",
        priority: "high",
        askCost: 3,
        fallback: "Assume category + 150-metre radius + 30-day window.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 3, utility: 64 },
        answer: "نفس النوع في ١٥٠ متر خلال ٣٠ يوم، مع مراجعة يدوية للحدود.",
        resolution: "answered",
      },
      {
        text: "When an anonymous report cannot be resolved without site access (e.g., inside a building), what happens?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume the follow-up code allows optional contact reveal by the reporter.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 3, askCost: 2, utility: 54 },
        resolution: "proceed_with_uncertainty",
      },
      {
        text: "Should reporters see team-level status ('assigned to water team') or only generic progress?",
        priority: "low",
        askCost: 2,
        fallback: "Assume generic progress only.",
        utility: { infoGain: 2, impact: 2, uncertainty: 2, risk: 2, askCost: 2, utility: 4 },
        answer: "تقدم عام بس — من غير تفاصيل الفرق.",
        resolution: "answered",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Residents shall file reports with a category, location marker, optional photos, and receive a follow-up code without providing identity.",
        type: "functional",
        priority: "Must",
        ambiguity: 14,
        confidence: 91,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "The system shall handle the issue quickly and properly.",
        type: "functional",
        priority: "Must",
        ambiguity: 78,
        ambiguityNote: "'Quickly' and 'properly' are unmeasurable; target response exists in E2.",
        suggestion:
          "Rewrite: 'The responsible team shall record a first response within 72 hours of report submission; the reporter sees a progress update at each state change.'",
        confidence: 58,
        verify: "weak",
        verifyNote: "Critic: no measurable criterion — rewrite proposed from E2's 72h target.",
        evidence: ["E2"],
      },
      {
        refId: "REQ-03",
        text: "Duplicate reports of the same issue shall be merged so effort is not wasted.",
        type: "functional",
        priority: "Should",
        ambiguity: 62,
        ambiguityNote: "'Same issue' undefined; 'merged' behaviour unspecified.",
        suggestion:
          "Rewrite: 'A report is a duplicate when its category matches an open report within 150 metres submitted in the last 30 days; duplicates link to the original and notify the reporter.'",
        confidence: 66,
        verify: "weak",
        verifyNote: "Critic: matching rule needed; Q1 answer provides it.",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-04",
        text: "Reporters may optionally reveal contact for site-access follow-ups via their follow-up code (assumption Q2).",
        type: "functional",
        priority: "Should",
        ambiguity: 24,
        confidence: 80,
        verify: "supported",
        evidence: ["E1"],
      },
      {
        refId: "REQ-05",
        text: "Progress shown to reporters is generic (received → assigned → resolved) without team names.",
        type: "functional",
        priority: "Could",
        ambiguity: 11,
        confidence: 90,
        verify: "supported",
        evidence: ["E1"],
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Duplicate rule: category + 150m + 30 days with manual boundary review (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Site-access contact reveal carried as assumption (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Generic progress only (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: reports vanishing without follow-up — impact 4, effort 2." },
      { stage: "AMBIGUITY", actor: "agent", action: "rewrites_proposed", detail: "REQ-02 and REQ-03 flagged weak with proposed rewrites — human arbitration pending." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20200, estTokens: 4900, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13200, estTokens: 3400, estCostUsd: 0.0008 },
      { stage: "EXTRACTION", status: "done", latencyMs: 28900, estTokens: 7500, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21600, estTokens: 5300, estCostUsd: 0.0013 },
    ],
  },
];
