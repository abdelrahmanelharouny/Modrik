// ─────────────────────────────────────────────────────────────
// Mission Library · Part A (5 missions)
// 1  TukTuk Fleet Tracker        — landed, Giza last-mile transport
// 2  LMS Offline Mode            — landed, Aswan ed-tech
// 3  Clinic Booking Companion    — briefing (pending questions)
// 4  Freelancer Escrow Wallet    — landed, Alexandria fintech
// 5  Ramadan Food-Bank Relay     — briefing (pending questions)
// ─────────────────────────────────────────────────────────────
import type { MissionSeed } from "@/lib/mission-library";

export const LIBRARY_A: MissionSeed[] = [
  // ── 1 · TukTuk Fleet Tracker ────────────────────────────────
  {
    id: "tuktuk-fleet",
    name: "TukTuk Fleet Tracker — Giza",
    domain: "Transport",
    domainAr: "نقل",
    tagline: "Trip management for drivers who navigate by landmarks, not pins",
    taglineAr: "إدارة رحلات لسوّاقين بيمشّيوك بعلامات مش بينات",
    focus: "cash economy · offline-first · landmark navigation",
    focusAr: "اقتصاد كاش · يعمل أوفلاين · علامات مكانية",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A lightweight Android app for a 40-driver tuk-tuk cooperative in Giza. Drivers log trips, " +
      "collect cash fares and see daily earnings; the cooperative owner sees fleet activity and " +
      "settles weekly. Drivers work 10-hour shifts with patchy 3G and navigate by landmarks. " +
      "The MVP must run on cheap handsets and never block a fare collection.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع السائق محمود (الجيزة)",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا بشتغل توكتوك من ٦ سنين. الزبون بيقولي «قدام مسجد الحسين عند العصاري» مش بينزّل لينك. " +
          "لو التطبيق ألزمني أدخل اسم مكان مكتوب بالحرف، هرمي في الأرض. الفلوس كاش برضه — فيزا معايا بس مش بستخدمها. " +
          "المهم عندي إن آخر اليوم أشوف جبت كام، من غير ما أحسب بإيدي. والنت بيقطع كتير جوه الحواري، " +
          "فلو التطبيق وقف بسبب النت هرمي فيه.",
        consent: true,
      },
      {
        code: "E2",
        title: "Cooperative operations memo (owner)",
        sourceType: "document",
        language: "en",
        content:
          "Settlement is weekly, every Thursday, cash in hand. The cooperative takes 10% of net fares. " +
          "Every driver must log each trip: pickup area, drop area, agreed fare. Trips must be loggable " +
          "with zero connectivity and upload automatically later. Landmark-based pickup entry is mandatory; " +
          "GPS pins are unreliable under bridges. Fare disputes are resolved from the trip log — the log is " +
          "the single source of truth. Weekly report per driver: trips, gross, cooperative share, net.",
      },
      {
        code: "E3",
        title: "Owner + technician sync notes",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "اتفقنا إن الـ MVP هيدخل الـ trips والـ earnings بس، من غير wallet — الـ wallet مرحلة تانية. " +
          "بس لازم نعمل export للـ weekly report كـ PDF عشان الورق الرسمي. " +
          "The app must install under 40MB and run on Android 8 — دي مواصفات الموبايلات عندهم. " +
          "كمان لو السائق cancelت رحلة بعد ما الزبون اتأكد، لازم نسجلها — الـ owner عايز يعرف الـ no-shows. " +
          "Sharing trip to WhatsApp كان طلب من السائقين — بس مش MVP.",
      },
    ],
    questions: [
      {
        text: "When the driver logs a trip offline, how long must the app keep un-synced trips before warning him — and what happens if he closes the app?",
        rationale: "E2 demands offline logging but is silent on retention and app-close behaviour; this decides queue durability.",
        priority: "high",
        askCost: 2,
        fallback: "Assume trips persist locally for 72 hours and survive app restarts.",
        utility: { infoGain: 4, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 160 },
        answer: "Keep for 72h, survive restart, warn at 24h if still unsynced.",
        resolution: "answered",
      },
      {
        text: "هل حساب «نصيب التعاونية» بيتم على الرحلة الواحدة ولا على أسبوع كامل؟ لو يوم السائق خسر، بنخصم من إيه؟",
        priority: "high",
        askCost: 3,
        fallback: "Assume weekly settlement with no per-trip deduction and no loss carry-over in the MVP.",
        utility: { infoGain: 3, impact: 4, uncertainty: 4, risk: 3, askCost: 3, utility: 48 },
        answer: "أسبوع كامل، ومفيش خصم لو اليوم خسر — الحساب أسبوعي بس.",
        resolution: "answered",
      },
      {
        text: "What exactly should the driver see as «earnings» — gross fares, minus cooperative share, minus what else (fuel, maintenance)?",
        rationale: "E1 says 'daily earnings', E2 defines weekly net. The composition of the number decides trust in the app.",
        priority: "medium",
        askCost: 2,
        fallback: "Assume daily gross + weekly net only; no expense tracking in MVP.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 2, utility: 27 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "The driver shall log a trip by selecting a pickup landmark and a drop landmark from the cooperative's landmark list, plus the agreed fare.",
        type: "functional",
        priority: "Must",
        ambiguity: 12,
        ambiguityNote: "Landmark list source is defined by E2; fare entry numeric.",
        confidence: 94,
        verify: "supported",
        verifyNote: "Directly grounded in E1 (landmark navigation) and E2 (trip log fields).",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "Trips logged without connectivity shall be stored on-device and uploaded automatically when a connection returns, surviving app restarts.",
        type: "nonfunctional",
        priority: "Must",
        ambiguity: 18,
        confidence: 90,
        verify: "supported",
        verifyNote: "E2 mandates zero-connectivity logging with delayed upload; retention window confirmed in Q1 answer.",
        evidence: ["E2"],
      },
      {
        refId: "REQ-03",
        text: "The app shall show the driver his trips, gross fares and net after the 10% cooperative share, refreshed after every completed trip.",
        type: "functional",
        priority: "Must",
        ambiguity: 30,
        ambiguityNote: "'Show' is vague on daily vs weekly view composition — carried as a recorded assumption (Q3).",
        suggestion: "Split into a daily gross view and a weekly net view with the cooperative share itemised.",
        confidence: 82,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-04",
        text: "التطبيق يولّد تقرير أسبوعي PDF لكل سائق: عدد الرحلات، الإجمالي، نصيب التعاونية، الصافي.",
        type: "functional",
        priority: "Should",
        language: "ar-EG",
        ambiguity: 8,
        confidence: 92,
        verify: "supported",
        verifyNote: "E3 explicitly requires PDF weekly report export.",
        evidence: ["E2", "E3"],
      },
      {
        refId: "REQ-05",
        text: "The app shall install at 40 MB or less and run on Android 8.0 devices with 2 GB RAM.",
        type: "constraint",
        priority: "Must",
        ambiguity: 5,
        confidence: 96,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-06",
        text: "The system shall record driver cancellations of confirmed trips and surface no-show counts to the owner.",
        type: "functional",
        priority: "Should",
        ambiguity: 22,
        confidence: 78,
        verify: "weak",
        verifyNote: "Critic: 'surface' does not specify where or when the owner sees counts — weekly report vs dashboard undefined.",
        evidence: ["E3"],
      },
      {
        refId: "REQ-07",
        text: "Trip sharing to WhatsApp is out of scope for the MVP.",
        type: "constraint",
        priority: "Won't",
        ambiguity: 3,
        confidence: 95,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-01",
        refId: "US-01",
        title: "Log a landmark-based trip",
        narrative:
          "As a tuk-tuk driver, I want to log a trip by picking the pickup and drop landmarks and typing the agreed fare, so that my day is recorded without typing addresses.",
        acceptance: [
          "Landmark picker opens within 2 taps from the home screen",
          "Fare accepts digits only, in EGP",
          "Trip saves with zero connectivity and shows a queued icon",
        ],
        invest: 84,
        status: "approved",
      },
      {
        req: "REQ-02",
        refId: "US-02",
        title: "Never lose an offline trip",
        narrative:
          "As a driver in a low-coverage street, I want my unsent trips to survive app restarts and upload when signal returns, so that I never argue about lost fares.",
        acceptance: [
          "Queued trips persist for 72 hours minimum",
          "Upload retries automatically when connectivity returns",
          "App restart does not clear the queue",
        ],
        invest: 79,
        status: "approved",
      },
      {
        req: "REQ-03",
        refId: "US-03",
        title: "See my money at a glance",
        narrative:
          "As a driver, I want today's gross and this week's net (after the 10% share) visible on one screen, so that I know what to expect on Thursday.",
        acceptance: [
          "Daily gross updates after each completed trip",
          "Weekly net itemises the cooperative share",
        ],
        invest: 71,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-04",
        title: "Weekly PDF report per driver",
        narrative:
          "As the cooperative owner, I want a per-driver weekly PDF (trips, gross, share, net), so that Thursday settlement is a printout, not a debate.",
        acceptance: [
          "PDF generates for any past week",
          "All four figures present per driver",
          "File opens on Android 8 with any standard PDF viewer",
        ],
        invest: 66,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-03",
        b: "REQ-04",
        kind: "duplication",
        taxonomy: "terminology",
        description:
          "REQ-03 (in-app earnings) and REQ-04 (PDF weekly report) both claim to present 'earnings' with different scopes (daily vs weekly, live vs document).",
        severity: "medium",
        implications: [
          { option: "Keep both with distinct names", impact: "IF kept distinct => daily view shows gross-only, PDF is the settlement document; extra screen but zero reconciliation ambiguity." },
          { option: "Merge into one earnings module", impact: "IF merged => single source of numbers, but settlement still needs a printable artifact; MVP scope grows." },
        ],
        resolution: "Kept distinct: in-app daily gross + weekly net; PDF is the settlement artifact. Names fixed: 'Earnings' vs 'Settlement report'.",
      },
      {
        a: "REQ-01",
        b: "REQ-06",
        kind: "overlap",
        taxonomy: "precedence",
        description:
          "Confirming a trip (REQ-01 log) versus recording its cancellation (REQ-06) touch the same trip state machine; the precedence of 'confirmed' was ambiguous.",
        severity: "medium",
        implications: [
          { option: "Cancellation only after log", impact: "IF log-first => every cancel is traceable to a trip row; owner no-show counts are accurate." },
          { option: "Cancellation without log", impact: "IF free cancel => lightweight for drivers but no-show analytics become guesswork." },
        ],
        resolution: "Log-first: cancellation is an operation on a logged trip. Precedence recorded in the journal.",
      },
    ],
    edges: [
      { from: "REQ-03", to: "REQ-01", kind: "depends_on", note: "Earnings compute from completed trip logs." },
      { from: "REQ-04", to: "REQ-03", kind: "depends_on", note: "PDF aggregates the same figures shown in-app." },
      { from: "REQ-04", to: "REQ-02", kind: "affected_by", note: "Un-synced trips change weekly totals." },
      { from: "REQ-01", to: "REQ-05", kind: "validates", note: "Landmark picker must stay within the 40 MB budget." },
    ],
    execs: [
      {
        req: "REQ-01",
        given: "driver is offline in a side street",
        when: "he logs a trip from 'El-Hussein Mosque' to 'El-Asri' with fare 40 EGP",
        then: "trip saves locally with a queued icon and uploads when signal returns",
        resolution: "defined",
      },
      {
        req: "REQ-03",
        given: "driver completed 12 trips today totalling 480 EGP",
        when: "he opens the earnings screen at 22:00",
        then: "daily gross shows 480 EGP and weekly net shows 432 EGP after the 10% share",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a driver cancels a confirmed trip after the cooperative already counted it in the weekly report",
        when: "the owner settles on Thursday",
        then: "??? — the baseline is silent on correcting an already-settled week",
        resolution: "undefined",
        undefinedReason: "No requirement covers post-settlement corrections or cancellation windows relative to settlement.",
        discovery: "Should the weekly report regenerate when a logged trip is cancelled after the PDF was issued — and who is notified?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Offline retention fixed at 72h with 24h warning (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Settlement confirmed weekly, no per-trip deduction (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Earnings composition carried as assumption: daily gross + weekly net, no expense tracking (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: trust in the trip log under zero connectivity — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-03 split into daily/weekly views to remove 'show' vagueness." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Duplication REQ-03/REQ-04 resolved by renaming distinct artifacts." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 21400, estTokens: 5200, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 14800, estTokens: 3900, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 31200, estTokens: 8100, estCostUsd: 0.0019 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 22700, estTokens: 5600, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18900, estTokens: 4700, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 17300, estTokens: 4400, estCostUsd: 0.001 },
    ],
  },

  // ── 2 · LMS Offline Mode ────────────────────────────────────
  {
    id: "lms-offline",
    name: "LMS Offline Mode — Aswan",
    domain: "EdTech",
    domainAr: "تعليم",
    tagline: "Lesson packs and quizzes that survive village bandwidth",
    taglineAr: "دروس واختبارات تشتغل من غير نت",
    focus: "offline packs · low-end devices · RTL content",
    focusAr: "حزم أوفلاين · أجهزة ضعيفة · محتوى بالعربي",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A learning-management companion for a secondary-school program in Aswan where home connectivity is intermittent. " +
      "Students download lesson packs at school, complete quizzes offline at home, and everything syncs when they return. " +
      "Teachers grade and parents follow progress. Devices are low-end Android; content is heavily Arabic RTL.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع الأستاذة هدى — مدرسية رياضيات",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا بنرفع الدرس الخميس عشان الطلبة ينزلوه في المدرسة على الواي فاي. البيت عندهم نت ضعيف أو مفيش. " +
          "المشكلة إن بعضهم يفتح الكويز في البيت ويقفل التطبيق في النص، ودرجته بتضيع. عايزة أعرف مين فتح إيه وامتى، " +
          "حتى لو النت جاي بعدين. ولو الطالب نزّل حاجة من موبايل صغير، الدرس لازم يفتح من غير ما يعلّق.",
        consent: true,
      },
      {
        code: "E2",
        title: "IT coordinator constraints memo",
        sourceType: "document",
        language: "en",
        content:
          "Device floor: Android 9, 2 GB RAM, 32 GB storage with ~8 GB free. A lesson pack (video 480p + PDF + quiz) must not exceed 60 MB. " +
          "Sync must be resumable — a dropped 3G transfer at 90% must not restart from zero. Quiz answers are stored locally, encrypted, " +
          "and pushed on next connectivity. Server is the source of truth on sync conflicts; last-teacher-edit wins for content, student answers are never overwritten.",
      },
      {
        code: "E3",
        title: "Parents' meeting notes",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "الأولياء عايزين يعرفوا الولد سلّم امتى وإيه درجاته من غير ما يدخلوا التفاصيل كلها. " +
          "Agreed on a weekly progress notification فقط، مش realtime — عشان ميقلقوناش. " +
          "كمان سألوا لو التطبيق هيشتغل على موبايل الأم القديم — لازم يشتغل. " +
          "Achievement badges كانت فكرة حلوة بس مش أولوية.",
      },
    ],
    questions: [
      {
        text: "When a student retakes an offline quiz, which attempt counts — first, last, or best?",
        priority: "high",
        askCost: 2,
        fallback: "Assume last completed attempt counts; earlier attempts retained for the teacher.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 2, utility: 96 },
        answer: "آخر محاولة مكتملة هي اللي بتتحسب، والباقي يظهر للمدرس.",
        resolution: "answered",
      },
      {
        text: "How much storage may the app use on a student device before it must ask permission to clear old packs?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume a 2 GB ceiling with a prompt before auto-clearing packs older than 30 days.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 3, askCost: 2, utility: 40 },
        answer: "2 جيجا سقف، واسأل قبل مسح أي حاجة أقدم من ٣٠ يوم.",
        resolution: "answered",
      },
      {
        text: "What should a teacher see when two versions of the same lesson pack exist after a sync conflict?",
        rationale: "E2 defines conflict policy but the teacher-facing presentation is undefined.",
        priority: "medium",
        askCost: 3,
        fallback: "Assume a single 'synced with changes' badge listing what changed.",
        utility: { infoGain: 3, impact: 3, uncertainty: 3, risk: 2, askCost: 3, utility: 18 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "Students shall download lesson packs (video 480p, PDF, quiz) of at most 60 MB each while on school Wi-Fi.",
        type: "constraint",
        priority: "Must",
        ambiguity: 6,
        confidence: 95,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-02",
        text: "Quiz attempts completed offline shall be stored encrypted on-device and submitted automatically on the next connectivity window, without data loss on app close.",
        type: "functional",
        priority: "Must",
        ambiguity: 14,
        confidence: 92,
        verify: "supported",
        verifyNote: "E1 pain point (lost attempt) directly addressed; E2 defines the encrypted push.",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-03",
        text: "Downloads shall be resumable: a connection drop mid-pack must continue from the last received chunk, not restart.",
        type: "nonfunctional",
        priority: "Must",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-04",
        text: "على المدرس أن يرى لكل طالب: ما فُتح، ما أُكمل، ودرجات المحاولات — حتى لو المزامنة وصلت متأخرة.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 16,
        confidence: 88,
        verify: "supported",
        evidence: ["E1"],
      },
      {
        refId: "REQ-05",
        text: "Parents shall receive one weekly progress notification summarising submissions and grades, without real-time alerts.",
        type: "functional",
        priority: "Should",
        ambiguity: 20,
        confidence: 85,
        verify: "supported",
        evidence: ["E3"],
      },
      {
        refId: "REQ-06",
        text: "All student-facing content shall render correctly in RTL Arabic including equations and mixed-direction lines.",
        type: "nonfunctional",
        priority: "Must",
        ambiguity: 26,
        ambiguityNote: "'Correctly' needs acceptance fixtures for mixed-direction math lines.",
        suggestion: "Define an RTL test fixture set: pure Arabic, Arabic + Latin terms, math expressions, and the expected bidi behaviour for each.",
        confidence: 80,
        verify: "supported",
        evidence: ["E1", "E3"],
      },
      {
        refId: "REQ-07",
        text: "Achievement badges are deferred beyond the MVP.",
        type: "constraint",
        priority: "Won't",
        ambiguity: 4,
        confidence: 94,
        verify: "supported",
        evidence: ["E3"],
      },
    ],
    stories: [
      {
        req: "REQ-01",
        refId: "US-01",
        title: "Grab the week's pack at school",
        narrative:
          "As a student, I want to download this week's lesson pack at school in one tap, so that I can study at home with no internet.",
        acceptance: [
          "Pack downloads fully within the 60 MB limit",
          "Download resumes automatically if Wi-Fi drops",
          "Downloaded packs open with zero connectivity",
        ],
        invest: 88,
        status: "approved",
      },
      {
        req: "REQ-02",
        refId: "US-02",
        title: "Finish the quiz, keep the score",
        narrative:
          "As a student on patchy home internet, I want my quiz answers saved even if the app closes, so that my grade is never lost.",
        acceptance: [
          "Answers save locally after every question",
          "Submission happens automatically on next connectivity",
          "Force-close mid-quiz loses nothing",
        ],
        invest: 90,
        status: "approved",
      },
      {
        req: "REQ-04",
        refId: "US-03",
        title: "Who opened what — even late",
        narrative:
          "As a teacher, I want per-student open/complete/attempt data even when sync arrives days later, so that I grade reality, not guesses.",
        acceptance: [
          "Late-synced data appears with its true timestamps",
          "Per-student view lists attempts, not just final grade",
        ],
        invest: 76,
        status: "approved",
      },
      {
        req: "REQ-05",
        refId: "US-04",
        title: "One calm weekly ping for parents",
        narrative:
          "As a parent, I want a single weekly summary of my child's submissions and grades, so that I stay informed without being spammed.",
        acceptance: [
          "Exactly one notification per week per child",
          "Summary opens the detailed view on tap",
        ],
        invest: 63,
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
          "Both requirements budget scarce resources on weak connections: encrypted answer pushes (REQ-02) and resumable chunk downloads (REQ-03) compete for the same bandwidth windows.",
        severity: "low",
        implications: [
          { option: "Prioritise quiz submissions", impact: "IF quizzes first => grades are safe; big packs resume in background at night." },
          { option: "Prioritise pack downloads", impact: "IF packs first => students get content but risk holding grades hostage to a 60 MB transfer." },
        ],
        resolution: "Quiz submissions always preempt pack downloads in the sync scheduler. Recorded as a scheduling rule.",
      },
    ],
    edges: [
      { from: "REQ-02", to: "REQ-03", kind: "depends_on", note: "Encrypted push reuses the resumable transfer layer." },
      { from: "REQ-04", to: "REQ-02", kind: "depends_on", note: "Teacher view renders only what attempts produce." },
      { from: "REQ-06", to: "REQ-01", kind: "validates", note: "RTL fixtures must pass for every pack template." },
      { from: "REQ-05", to: "REQ-04", kind: "derived_from", note: "Weekly parent summary is an aggregate of teacher-visible data." },
    ],
    execs: [
      {
        req: "REQ-03",
        given: "a lesson pack is 90% downloaded and 3G drops",
        when: "connectivity returns an hour later",
        then: "download resumes from the last chunk and completes without restarting",
        resolution: "defined",
      },
      {
        req: "REQ-02",
        given: "a student answers 8 of 10 questions offline and the phone battery dies",
        when: "she reopens the app the next morning at school",
        then: "the 8 answers are present and submit automatically; the quiz resumes at question 9",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "a student studies on two devices (her phone and her mother's) offline",
        when: "both devices sync after three days",
        then: "??? — the baseline is silent on merging per-device attempt history",
        resolution: "undefined",
        undefinedReason: "No requirement defines multi-device identity or attempt-history merge semantics.",
        discovery: "Should attempts from multiple offline devices merge per student with device labels, or should one device be designated primary?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Retake policy: last completed attempt counts (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Storage ceiling 2 GB with 30-day prompt (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Sync-conflict presentation carried as assumption: 'synced with changes' badge (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: grade loss under intermittent connectivity — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-06 got an RTL fixture-set definition to make 'correctly' testable." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Bandwidth precedence fixed: quizzes preempt packs." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 20100, estTokens: 5100, estCostUsd: 0.0012 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 13900, estTokens: 3700, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 29800, estTokens: 7800, estCostUsd: 0.0018 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 21900, estTokens: 5400, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 18400, estTokens: 4600, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 16600, estTokens: 4200, estCostUsd: 0.001 },
    ],
  },

  // ── 3 · Clinic Booking Companion (briefing — pending questions) ─
  {
    id: "clinic-companion",
    name: "Clinic Booking Companion — Nasr City",
    domain: "Health",
    domainAr: "صحة",
    tagline: "Sitting in Briefing: three unanswered questions block the route plot",
    taglineAr: "واقفة في الإحاطة: تلات أسئلة من غير إجابة",
    focus: "appointments · reminders · insurance",
    focusAr: "حجوزات · تذكيرات · تأمين",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "briefing",
    brief:
      "A companion app for a busy multi-doctor internal clinic in Nasr City: patients book, reschedule and get reminded; " +
      "reception manages the day list. Patients are mostly older adults, phone calls dominate today, and double-bookings " +
      "are the clinic's #1 complaint. The team wants evidence before committing to a booking model.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع مريضة (٦٢ سنة) — بتنادي للحجز",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أنا بحجز بالتليفون بس، ومرات أقول لابنتي تحجزلي. مش بعرف أدخل في تطبيقات كتير. " +
          "مرة رحت العيادة لقيت الموعد اتأخر ساعتين ومحدش اتصل بي. لو في تطبيق، عايزاه يقولي «تعالى الساعة كذا» ويفكرني قبل بيوم. " +
          "والتأمين بتاعي بيتأخر في الاعتماد كل مرة.",
        consent: true,
      },
      {
        code: "E2",
        title: "Clinic manager operating brief",
        sourceType: "document",
        language: "en",
        content:
          "Two receptionists manage ~90 appointments/day across 4 doctors. Double-booking happens when phone lines queue. " +
          "Reminder calls cost ~1.5 staff-hours daily. Cancellation policy: patients may reschedule up to 12 hours before; " +
          "later changes are marked 'late'. Insurance pre-approval (Bupa/MetLife) is manual today and the top source of waiting-room friction. " +
          "The MVP must not replace the phone line — it complements it.",
      },
      {
        code: "E3",
        title: "Reception sync (voice note transcription)",
        sourceType: "transcript",
        language: "codeswitch",
        content:
          "بنتفق إن أهم حاجة عندنا الـ no-shows. لو الـ reminder وصل بالرسائل هيفرق جداً. " +
          "بس في ناس مسجلة برقم ولد أو بنت — الـ reminder لازم يوصل للمريض نفسه مش بس اللي حجز. " +
          "We need the day list to refresh live — حالياً بنكتب على ورق وبيحصل لخبطة.",
      },
    ],
    questions: [
      {
        text: "For older patients, should booking require an account, or may a first booking be created with just a phone number verified by OTP?",
        rationale: "E1 shows low app literacy; account walls may push patients back to phone calls, defeating the MVP.",
        priority: "high",
        askCost: 2,
        fallback: "Assume phone-number-first booking with optional profile later.",
        utility: { infoGain: 5, impact: 5, uncertainty: 4, risk: 3, askCost: 2, utility: 150 },
        answer: "رقم الموبايل + كود، والبروفايل يكمّل بعدين.",
        resolution: "answered",
      },
      {
        text: "Which channel is authoritative for reminders — SMS, WhatsApp template message, or in-app push — given patients may be booked by a relative?",
        priority: "high",
        askCost: 2,
        fallback: "Assume SMS to the patient's own number as authoritative; app push as enhancement.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 2, utility: 96 },
        resolution: "pending",
      },
      {
        text: "Should the app show real-time slot availability, or confirm requests through reception to protect the phone-line workflow?",
        rationale: "E2 says the MVP complements, not replaces, the phone line — but real-time availability changes reception's role.",
        priority: "high",
        askCost: 3,
        fallback: "Assume request-then-confirm model for the MVP.",
        utility: { infoGain: 4, impact: 5, uncertainty: 3, risk: 3, askCost: 3, utility: 60 },
        resolution: "pending",
      },
      {
        text: "Insurance pre-approval: should the MVP digitise the request form now, or display only 'insurance pending' status?",
        priority: "medium",
        askCost: 3,
        fallback: "Assume status display only in MVP; digital forms deferred.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 2, askCost: 3, utility: 24 },
        resolution: "pending",
      },
      {
        text: "Who may cancel on behalf of an elderly patient — the booker (relative) too, or only the patient's verified number?",
        priority: "low",
        askCost: 2,
        fallback: "Assume the booker may cancel with the clinic's 'late' rules applying.",
        utility: { infoGain: 2, impact: 3, uncertainty: 2, risk: 2, askCost: 2, utility: 6 },
        resolution: "pending",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Phone-number-first booking confirmed (Q1)." },
      { stage: "ELICITATION", actor: "agent", action: "questions_proposed", detail: "5 planner-ranked questions generated; 4 remain pending awaiting stakeholder input." },
    ],
    runs: [{ stage: "ELICITATION", status: "done", latencyMs: 22800, estTokens: 5800, estCostUsd: 0.0014 }],
  },

  // ── 4 · Freelancer Escrow Wallet (landed, fintech) ─────────
  {
    id: "escrow-wallet",
    name: "Freelancer Escrow Wallet — Alexandria",
    domain: "Fintech",
    domainAr: "تقنية مالية",
    tagline: "Milestone escrow that keeps both sides honest",
    taglineAr: "ضمان أقساط يحمي الطرفين",
    focus: "escrow release · disputes · PDPL identity",
    focusAr: "تحرير الضمان · نزاعات · تحقق الهوية",
    languages: ["ar-EG", "en", "codeswitch"],
    layout: "landed",
    brief:
      "A local escrow service for Egyptian freelancers paid by foreign clients. Clients fund a milestone; " +
      "the freelancer delivers; funds release on approval or after a dispute window. Compliance is central: " +
      "identity verification, clear fee display, and withdrawal to local wallets. Trust is the product.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع فريلانسر (مصمم UI) — الإسكندرية",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "أكتر حاجة بتوحّشني إن العميل يختفي بعد التسليم. عايز النظام يحرر الفلوس لو سكت ٧ أيام من غير رد. " +
          "وكمان رسوم المنصة لازم تظهرلي قبل ما أقبل المشروع مش بعدين. " +
          "والسحب على فودافون كاش مهم جداً — الحسابات البنكية معقدة علىنا.",
        consent: true,
      },
      {
        code: "E2",
        title: "Compliance requirements draft (legal counsel)",
        sourceType: "document",
        language: "en",
        content:
          "Identity verification (national ID + liveness) is mandatory before first withdrawal. Personal data handling must follow Egypt PDPL: " +
          "purpose-limited storage, erasure on account closure, no third-party sharing without explicit consent. " +
          "Dispute window is 7 calendar days from delivery; funds auto-release at window close with no open dispute. " +
          "All fees must be displayed before contract acceptance. Every state change (funded, delivered, disputed, released) must produce an immutable receipt.",
      },
      {
        code: "E3",
        title: "Product sync notes",
        sourceType: "meeting",
        language: "codeswitch",
        content:
          "اتفقنا إن الـ dispute flow يحتاج evidence من الطرفين — screenshots وملفات، مش كلام بس. " +
          "الـ partial refund كان نص نص ولا حل — decided: نبدأ بـ full release أو full refund بس في الـ MVP. " +
          "Withdrawal to Vodafone Cash confirmed for MVP. الـ export بتاع الـ transactions لازم يبقى CSV للضرايب.",
      },
    ],
    questions: [
      {
        text: "When a dispute opens, who reviews it — an internal ops agent, or is the MVP arbitration-free (auto-release or full refund only)?",
        priority: "high",
        askCost: 2,
        fallback: "Assume arbitration-free MVP: release or full refund, decided by the client before window close.",
        utility: { infoGain: 5, impact: 5, uncertainty: 4, risk: 4, askCost: 2, utility: 200 },
        answer: "من غير تحكيم في الـ MVP: تحرير كامل أو رفض كامل من العميل قبل نهاية المدة.",
        resolution: "answered",
      },
      {
        text: "May a freelancer withdraw while a dispute is open on another milestone of the same contract?",
        priority: "medium",
        askCost: 3,
        fallback: "Assume yes — disputes freeze only their own milestone.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 3, askCost: 3, utility: 36 },
        answer: "أيوه، النزاع يجمّد قسمه بس.",
        resolution: "answered",
      },
      {
        text: "What identity data is retained after account closure, and for how long, under our PDPL reading?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume anti-fraud minimum retained 90 days, then erased; receipts anonymised not deleted.",
        utility: { infoGain: 3, impact: 4, uncertainty: 4, risk: 3, askCost: 2, utility: 72 },
        resolution: "proceed_with_uncertainty",
      },
    ],
    requirements: [
      {
        refId: "REQ-01",
        text: "The client shall fund each milestone into escrow before work begins; the freelancer sees 'funded' status with the amount and fee breakdown before accepting.",
        type: "functional",
        priority: "Must",
        ambiguity: 8,
        confidence: 95,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-02",
        text: "Funds shall auto-release to the freelancer 7 calendar days after delivery if the client raises no dispute within the window.",
        type: "functional",
        priority: "Must",
        ambiguity: 6,
        confidence: 96,
        verify: "supported",
        verifyNote: "Window duration and behaviour grounded in E1 (silent-client fear) and E2 (7-day auto-release).",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-03",
        text: "A dispute shall be resolution-limited to full release or full refund in the MVP, with mandatory evidence attachments from both parties.",
        type: "functional",
        priority: "Must",
        ambiguity: 12,
        confidence: 90,
        verify: "supported",
        evidence: ["E2", "E3"],
      },
      {
        refId: "REQ-04",
        text: "Identity verification (national ID + liveness check) shall be completed before the first withdrawal; data handling follows Egypt PDPL with erasure on closure.",
        type: "constraint",
        priority: "Must",
        ambiguity: 20,
        ambiguityNote: "Retention specifics after closure carried as a recorded assumption (Q3: 90-day anti-fraud minimum).",
        suggestion: "State the retention schedule explicitly: which fields, how long, and what 'anonymised receipts' means.",
        confidence: 84,
        verify: "supported",
        evidence: ["E2"],
      },
      {
        refId: "REQ-05",
        text: "رسوم المنصة تظهر للمستقل بالجنيه قبل قبول المشروع، محسوبة من المبلغ الإجمالي مش من الباقي.",
        type: "functional",
        priority: "Must",
        language: "ar-EG",
        ambiguity: 10,
        confidence: 93,
        verify: "supported",
        evidence: ["E1", "E2"],
      },
      {
        refId: "REQ-06",
        text: "Withdrawal to Vodafone Cash shall be supported in the MVP; bank transfer may follow.",
        type: "functional",
        priority: "Should",
        ambiguity: 7,
        confidence: 92,
        verify: "supported",
        evidence: ["E1", "E3"],
      },
      {
        refId: "REQ-07",
        text: "Every escrow state change shall produce an immutable, exportable receipt; transactions export as CSV.",
        type: "functional",
        priority: "Should",
        ambiguity: 15,
        confidence: 87,
        verify: "supported",
        evidence: ["E2", "E3"],
      },
      {
        refId: "REQ-08",
        text: "Partial refunds and third-party arbitration are out of scope for the MVP.",
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
        req: "REQ-01",
        refId: "US-01",
        title: "See the money before saying yes",
        narrative:
          "As a freelancer, I want the funded amount and fee breakdown visible before I accept a milestone, so that there are no surprises at payout.",
        acceptance: ["Accept screen shows gross, platform fee, net — in EGP", "Acceptance is impossible while status is unfunded"],
        invest: 91,
        status: "approved",
      },
      {
        req: "REQ-02",
        refId: "US-02",
        title: "Auto-release after a quiet week",
        narrative:
          "As a freelancer, I want funds released automatically if the client stays silent for 7 days, so that disappearing clients cannot hold my money.",
        acceptance: [
          "Countdown visible from the delivery moment",
          "Release executes within 1 business day of window close",
          "Both parties receive the release receipt",
        ],
        invest: 89,
        status: "approved",
      },
      {
        req: "REQ-03",
        refId: "US-03",
        title: "A dispute with receipts, not shouting",
        narrative:
          "As either party, I want to attach evidence files to a dispute, so that the outcome rests on artifacts.",
        acceptance: [
          "Dispute requires at least one attachment from the opener",
          "Other party may respond within the window with evidence",
          "Outcome is exactly one of: full release, full refund",
        ],
        invest: 77,
        status: "approved",
      },
      {
        req: "REQ-06",
        refId: "US-04",
        title: "Cash-out to Vodafone Cash",
        narrative:
          "As a freelancer, I want to withdraw my available balance to Vodafone Cash, so that I can actually use my money.",
        acceptance: [
          "Available balance (not disputed milestones) is withdrawable",
          "Withdrawal shows fee and arrival estimate before confirming",
        ],
        invest: 74,
        status: "approved",
      },
    ],
    conflicts: [
      {
        a: "REQ-02",
        b: "REQ-03",
        kind: "contradiction",
        taxonomy: "precedence",
        description:
          "Auto-release at window close (REQ-02) collides with a dispute opened at hour 167 — which state wins when the window and the dispute clock end together?",
        severity: "high",
        implications: [
          { option: "Dispute freezes the window", impact: "IF dispute-first => no surprise releases; auto-release timer pauses and resumes only after resolution." },
          { option: "Window end is absolute", impact: "IF window-first => releases stay predictable but last-hour disputes feel arbitrary." },
        ],
        resolution: "A dispute opened at any point before window close freezes auto-release until resolution. Precedence documented.",
      },
      {
        a: "REQ-04",
        b: "REQ-06",
        kind: "overlap",
        taxonomy: "constraint",
        description:
          "PDPL identity data (REQ-04) and wallet withdrawals (REQ-06) both process personal data; the boundary of what the wallet provider may receive was undefined.",
        severity: "medium",
        implications: [
          { option: "Send only the wallet number", impact: "IF minimal payload => PDPL exposure shrinks; fraud tracing relies on our own records." },
          { option: "Send ID-verified name too", impact: "IF name shared => mismatches drop, but a third party now holds identity data (consent needed)." },
        ],
        resolution: "Minimal payload: wallet number only; name never shared with the wallet provider. Consent scope updated.",
      },
    ],
    edges: [
      { from: "REQ-02", to: "REQ-01", kind: "depends_on", note: "Release clock starts only for funded milestones." },
      { from: "REQ-03", to: "REQ-02", kind: "conflicts_with", note: "Dispute precedence over the auto-release timer (resolved rule)." },
      { from: "REQ-06", to: "REQ-04", kind: "depends_on", note: "Withdrawal gated by verified identity." },
      { from: "REQ-07", to: "REQ-02", kind: "validates", note: "Receipts must capture every state change including auto-release." },
      { from: "REQ-05", to: "REQ-01", kind: "refines", note: "Fee display is part of the pre-acceptance screen." },
    ],
    execs: [
      {
        req: "REQ-02",
        given: "a milestone was delivered on May 1 and the client never opened a dispute",
        when: "the window closes on May 8",
        then: "funds release to the freelancer's available balance and both parties receive receipts",
        resolution: "defined",
      },
      {
        req: "REQ-03",
        given: "a dispute is opened on day 6 with screenshots attached",
        when: "the window would have closed on day 7",
        then: "auto-release is frozen; the dispute resolves to full release or full refund",
        resolution: "defined",
      },
      {
        gapId: "GAP-01",
        given: "the client wants to refund half the milestone amount",
        when: "he opens the dispute flow",
        then: "??? — the baseline permits full release or full refund only, but the UI path for 'I want to offer half' is undefined",
        resolution: "undefined",
        undefinedReason: "No requirement defines client-side messaging for unsupported partial-refund intent.",
        discovery: "Should the dispute screen proactively explain why partial refunds are unsupported and what the two outcomes are?",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Arbitration-free MVP confirmed (Q1)." },
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Dispute freezes only its own milestone (Q2)." },
      { stage: "ELICITATION", actor: "human", action: "proceed_with_uncertainty", detail: "Post-closure retention carried as assumption: 90-day anti-fraud minimum (Q3)." },
      { stage: "PROBLEM_SELECTION", actor: "human", action: "selected_problem", detail: "Problem: silent-client fund lock — impact 5, effort 3." },
      { stage: "AMBIGUITY", actor: "human", action: "accepted_rewrite", detail: "REQ-04 retention schedule flagged for explicit statement." },
      { stage: "CONFLICTS", actor: "human", action: "resolved_conflict", detail: "Dispute precedence over window close fixed; wallet payload minimised." },
    ],
    runs: [
      { stage: "ELICITATION", status: "done", latencyMs: 21900, estTokens: 5400, estCostUsd: 0.0013 },
      { stage: "PROBLEM_SELECTION", status: "done", latencyMs: 14200, estTokens: 3800, estCostUsd: 0.0009 },
      { stage: "EXTRACTION", status: "done", latencyMs: 31500, estTokens: 8200, estCostUsd: 0.0019 },
      { stage: "AMBIGUITY", status: "done", latencyMs: 22400, estTokens: 5500, estCostUsd: 0.0013 },
      { stage: "STORIES", status: "done", latencyMs: 19100, estTokens: 4800, estCostUsd: 0.0011 },
      { stage: "CONFLICTS", status: "done", latencyMs: 17800, estTokens: 4500, estCostUsd: 0.001 },
    ],
  },

  // ── 5 · Ramadan Food-Bank Relay (briefing) ─────────────────
  {
    id: "foodbank-ramadan",
    name: "Ramadan Food-Bank Relay — Giza",
    domain: "Nonprofit",
    domainAr: "عمل خيري",
    tagline: "In Briefing: liability, routes and dignity — questions before anything",
    taglineAr: "في الإحاطة: مسؤولية، مسارات، وكرامة",
    focus: "surplus food · volunteer routes · privacy",
    focusAr: "فائض طعام · مسارات متطوعين · خصوصية",
    languages: ["ar-EG", "en"],
    layout: "briefing",
    brief:
      "A neighbourhood food bank in Giza collects surplus food from restaurants during Ramadan and delivers it the same evening " +
      "through volunteer drivers. Coordination is a chaos of WhatsApp groups. The team wants a minimal dispatch tool, but food-safety " +
      "liability and recipient privacy questions are unresolved and deliberately blocking the pipeline.",
    evidences: [
      {
        code: "E1",
        title: "مقابلة مع منسقة التطوع — أُم أنس",
        sourceType: "interview",
        language: "ar-EG",
        content:
          "إحنا بنشتغل في جروبات واتساب — المطعم يبعت «عندنا ٣٠ وجبة»، وأنا أبعت متطوع يمشي ياخد ويوزع. " +
          "المشكلة إن ساعات الواجبات بتتكرر أو طعام بيقعد لحد ما يبوظ. عايزة حد يقولي: فيه فائض دلوقتي هنا، ومين أقرب متطوع. " +
          "بس عايزة أصحاب المطاعم يطمّنوا: مش هانقل مسؤولية لو حصل حاجة. والناس اللي بتاخد — عايزين كرامتهم، مينشرش أسماءهم.",
        consent: true,
      },
      {
        code: "E2",
        title: "Volunteer handbook excerpt",
        sourceType: "document",
        language: "en",
        content:
          "Pickup windows: 16:00–18:00 daily. Food must reach recipients before 21:00. Volunteers use personal cars or motorbikes; " +
          "no cold chain exists — only dry/staple foods are accepted. Restaurants currently sign a one-page goodwill waiver. " +
          "Recipients are identified by building, never by name, in all volunteer communications.",
      },
    ],
    questions: [
      {
        text: "Does the goodwill waiver survive digitisation — i.e., does the app need an in-app waiver acknowledgement per pickup, or does the paper waiver stay authoritative?",
        priority: "high",
        askCost: 2,
        fallback: "Assume paper waiver stays authoritative; app records pickup metadata only.",
        utility: { infoGain: 5, impact: 5, uncertainty: 5, risk: 4, askCost: 2, utility: 250 },
        answer: "الورق هو المعتمد، والتطبيق يسجل بيانات الاستلام بس.",
        resolution: "answered",
      },
      {
        text: "For recipient dignity: should delivery addresses live only on the dispatcher's device, or is a token (building code) system acceptable?",
        rationale: "E1's privacy concern + E2's building-only rule leave the data model open.",
        priority: "high",
        askCost: 3,
        fallback: "Assume building-code tokens; exact addresses never stored.",
        utility: { infoGain: 4, impact: 4, uncertainty: 4, risk: 3, askCost: 3, utility: 64 },
        resolution: "pending",
      },
      {
        text: "How should the app rank volunteers for a pickup — distance, past acceptance rate, or manual dispatcher choice?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume manual choice with a distance hint only.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 2, askCost: 2, utility: 36 },
        resolution: "pending",
      },
      {
        text: "What is the failure protocol when no volunteer accepts within 30 minutes — escalate to another group, mark food undeliverable, or call a standby list?",
        priority: "medium",
        askCost: 2,
        fallback: "Assume escalation to a standby WhatsApp list, manually triggered.",
        utility: { infoGain: 3, impact: 4, uncertainty: 3, risk: 3, askCost: 2, utility: 54 },
        resolution: "pending",
      },
      {
        text: "هل بنسجل أسماء المستفيدين نهائياً، ولا حتى على جهاز المنسق؟",
        priority: "low",
        askCost: 1,
        fallback: "Assume no names anywhere, including local device storage.",
        utility: { infoGain: 2, impact: 3, uncertainty: 2, risk: 3, askCost: 1, utility: 36 },
        resolution: "pending",
      },
    ],
    decisions: [
      { stage: "ELICITATION", actor: "human", action: "answered_question", detail: "Paper waiver stays authoritative (Q1)." },
      { stage: "ELICITATION", actor: "agent", action: "questions_proposed", detail: "5 questions ranked; 4 pending — dignity/liability themes intentionally unresolved." },
    ],
    runs: [{ stage: "ELICITATION", status: "done", latencyMs: 21300, estTokens: 5300, estCostUsd: 0.0013 }],
  },
];
