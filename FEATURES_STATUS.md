# RequirementPilot — FEATURES_STATUS

**Build:** Mission Control × Research Completion build · 2026-10-09
**LLM:** every agent and instrument runs on **GLM, provided by Z.ai** (disclosed in the command bar, footer, and debrief). The provider interface (dev item 12) keeps the strategy fixed while the model is swappable: `RP_LLM_PROVIDER=glm | model-b | local` (env-driven, nothing hardcoded).
**Dynamicity rule:** every number, status, and record in the UI is computed live from the database via `/api/telemetry`, `/api/projects/*`, and the instrument APIs — the central registry (`src/lib/registry.ts`) holds only qualitative metadata. Nothing static is rendered.
**Human-in-the-loop:** the system presents findings and implications only; every verdict (answers, assumptions, selections, rewrites, conflict resolutions, imports) is a human action recorded in the immutable decision journal.

---

## 1 · COMPLETED (live in this build)

### Flight-deck UX (full redesign)
- **NIGHTFLIGHT design system** — void-navy cockpit theme, aurora-teal instrument glow, plasma violet, signal amber; Space Grotesk display + JetBrains Mono telemetry; HUD corner brackets, scanlines, blueprint grid.
- **Mission Control home** — animated fleet radar, live count-up telemetry, flight-plan map, mission cards, honest capability atlas, integrations bay.
- **UX-as-journey** — animated flight-path rail (Briefing → Route Plot → Airframe → Turbulence Scan → Payload → Clearance → Debrief) with traveling marker, phase transitions, human-gate banners per phase.
- **Bilingual interface** — English/Arabic toggle with RTL direction switching (persisted). Mobile-safe (390px verified).

### Research core
- **6-stage agentic engine** — Questioner, Scope, Extraction (Proposer+Critic), Ambiguity, Story, Consistency agents; per-stage artifact snapshots; HITL state machine with per-stage approval gates.
- **Impact-aware Question Planner (dev item 7 — the research heart)** — `Utility = (Information Gain × Downstream Impact × Uncertainty × Risk) ÷ Asking Cost`, deterministic formula in `src/lib/planner.ts`; per-question signal scoring; budget-constrained selection; utility breakdown stamped on every question in the Briefing queue. **4-arm ablation lab** (single-shot / random / LLM-self-select / impact-aware) in the Debrief Planner Lab — every arm judged by the SAME scorer and judge on **5 metrics** (avgUtility, utilityPerCost, evidenceCoverage, redundancyRate, dialectFit). Live-seeded ablation on the Ablation Lab project: impact-aware avgUtility 193.2 vs single-shot 72.4 / random 81.3 / LLM 77.8 (utility-per-cost 107 vs 31–39). Planner is now the default ELICITATION engine (`RP_PLANNER_ARM` overridable, per-run arm selector in the cockpit).
- **Uncertainty-gated asking (I1)** — ask-cost meters + fallback assumptions per question; answer / proceed-with-uncertainty / reopen; assumptions ledger surfaced in Health.
- **Impact-aware problem selection (N2)** — human-tuned impact/effort sliders with live value-ratio and evidence grounding.
- **Arabic-native-first elicitation (N7, deepened per dev item 6)** — evidence-language inspection drives the default: ALL questions targeting Arabic-speaking stakeholders are generated natively in Egyptian Arabic (not merely two), fallback assumptions in the question's own language, code-switch mirroring; Arabic ambiguity lexicon; live-verified (planner output returned native Arabic questions).
- **Voice-note intake (I5)** — in-browser MediaRecorder capture → WAV → GLM ASR → editable evidence (voice channel embedded in the interview flow).
- **Requirement Graph with typed edges (dev item 9)** — 6 edge kinds (`depends_on`, `conflicts_with`, `derived_from`, `refines`, `validates`, `affected_by`); LLM edge-proposal pass + conflict edges materialised from the Conflict table; **reverse impact traversal** (BFS with hop depth + path kinds) wired into the Constellation: click a node → "trace impact from here" → impacted nodes pulse. Live-verified: change to REQ-03 correctly propagates to REQ-01 via `depends_on`.
- **RequirementExecutability simulator (dev item 8)** — generates concrete Given/When/Then scenarios against the baseline and resolves each; **UNDEFINED = discovery**: baseline-silent scenarios are recorded with undefinedReason + the clarifying question that would define them (GAP ids for orphans). Live-verified: 9 scenarios, 7 defined, 2 UNDEFINED with discoveries.
- **Conflict taxonomy + implications-only negotiation (dev item 10)** — 6-way taxonomy (value / terminology / scale / constraint / precedence / knowledge) + per-direction implications (`IF … => impact`) rendered in the negotiation table; the system never picks. Live-verified: duplication/terminology with implications.
- **Decomposable Health/Debt (dev item 11)** — six deterministic debt dimensions (ambiguity, verification, uncertainty, conflict, traceability, executability) computed from the DB with per-requirement contribution drill-downs; LLM writes only the narrative around computed numbers.
- **Calibration validation (open requirement 1)** — reliability bins comparing claimed confidence vs critic-verifier outcomes, Brier score, ECE, over/under-confidence verdict. Live-verified: n=9, Brier 0.0903, ECE 0.0278, verdict well-calibrated (claimed 88% vs empirical 87% at the top bin).
- **Critic-verifier extraction (I3)** — confidence numbers, supported/weak verdicts with critic notes; ungrounded requirements forced to weak.
- **Evidence traceability** — every requirement carries cited evidence chips (E1…En).

### Trust spine
- **Decision journal (I12)** — immutable, every human/agent decision; exportable audit log.
- **Cost observatory (I13)** — latency, tokens, blended cost, provider id per run.
- **Consent registry (G13)** — per-evidence consent flags with visual states.

### Integrations (open requirement 2 — bidirectional)
- **GitHub Issues adapter** (`src/lib/integrations.ts`) — push approved requirements as issues (MoSCoW/verify/type labels, evidence citations in body), pull open issues for human curation, connection test, idempotent push via SyncMap trace rows.
- **Jira adapter (Cloud REST v3)** — push stories as issues (ADF descriptions with acceptance criteria + refs), pull via JQL, connection test, SyncMap trace.
- **Runtime credentials** — stored server-side in the Integration table or via `RP_GITHUB_*` / `RP_JIRA_*` env fallbacks; always masked in API responses; sync console UI with config dialog, test/push/pull, sync-map list. Graceful unconfigured errors (verified live).

### Benchmarks & study (dev items 13–14)
- **arbench-v2 benchmark bank** — **120 scenarios** (8 categories × 5 domains × 3 evidence mixes), **8 categories** (extraction, elicitation, ambiguity, conflict, traceability, executability, dialect_ar_eg, codeswitch), **6 gold artifact types** (requirements_json, question_utility_json, conflict_pairs_json, ambiguity_scores_json, exec_scenarios_json, trace_matrix_csv); hand-authored Egyptian-Arabic + code-switch seeds; deterministic assembly (`scripts/rp_bench_build.py` → `bench/`).
- **3-group user study infrastructure (dev item 14)** — StudySession/StudyEvent models; API to open sessions (A_traditional / B_unconstrained_llm / C_requirementpilot), log NASA-TLX + SUS + events; anonymised CSV export. Full IRB-ready protocol at `docs/study-protocol.md` (design, task scripts, measures, hypotheses H1–H3, analysis plan, PDPL consent, threats to validity).

### Constraint packs — dual role (dev item 10 config / I11)
- **Product role** — WCAG 2.2 / Egypt-PDPL-privacy / performance packs scan the user's requirement graph (LLM-assisted, per-pack pass/partial/fail).
- **Platform role (NEW)** — deterministic self-audit (`/api/self-audit`, `src/lib/constraints.ts`): WCAG 2.2 contrast math computed from live design tokens (16.81:1 body, all pairs pass AA; two AAA pairs verified), performance budgets from real telemetry (stage p95 25.6s vs 90s budget; costliest run $0.0017 vs $0.05), PDPL structure checks (consent coverage, cascade erasure, credential masking, local-provider residency option). Rendered in the Constraint Pack Bay.

### Production hardening (carried + this build)
- **LLM Provider Interface (dev item 12)** — fixed strategy (retry, JSON repair, usage accounting, evidence budgets) in `agents.ts`; swappable providers (GLM via z-ai-web-dev-sdk | any OpenAI-compatible Model B | local OpenAI-compatible server for air-gapped/PDPL-resident runs); provider id recorded per run; `/api/providers` status endpoint; FEATURE_ATLAS declares it live.
- **Truncated-JSON repair; transport + parse retries; ASR script guard; evidence budget; ungrounded-requirement safety net; journal reference integrity; pack 400 validation** (from the deep audit, all live, prompt stamp v2.1-audit).

---

## 2 · IN DEVELOPMENT

- **Ablation runs across the full benchmark** — the 4-arm harness is live in-product; systematic runs of arbench-v2's 120 scenarios with per-arm judging and statistical analysis are the next research milestone (single-project seeds exist; one known judge limitation: set-level metrics (coverage/redundancy/dialectFit) were flat across arms in the seeded run — the judge discriminates utility sharply but needs sharpening for set-level sensitivity).
- **Tracker round-trip into drift radar** — status changes in GitHub/Jira flowing back as drift signals (adapters done; webhook wiring next).
- **OAuth app flows** for GitHub/Jira in addition to PAT/API-token credentials (tokens work today; OAuth is the polish layer).

---

## 3 · NOT STARTED (next tier)

- **Field pilot program** — 2–3 university software/student teams running real requirements through the platform (targets: university research/demo deployment + public demo environment). Study infrastructure and protocol are ready; recruitment not started.
- **Statistical analysis pipeline for the 3-group study** — data collection API + CSV export are live; the Kruskal-Wallis/Dunn analysis script runs on the export once pilot data exists.

---

## 4 · MISSING (declared gaps, honestly surfaced)

- **Multi-stakeholder sessions** — multiple concurrent interviewees with per-persona evidence attribution.
- **Team accounts & RBAC** — missions are local to this deployment; no auth layer yet (by design for the research demo).
- **Offline/low-bandwidth mode** — the self-audit asserts structural WCAG compliance; a true offline mode is absent.
- **Automated E2E regression suite** — golden path verified by browser agent per build; a scripted Playwright suite is the missing piece for continuous validation.
- **Judge calibration for set-level metrics** — the ablation judge needs multi-set blind pairwise comparison to sharpen coverage/redundancy discrimination (utility metrics are sharp).

---

## Verification record (this build, 2026-10-09)
- `tsc --noEmit` clean for `src/` · `eslint` clean · `prisma db push` in sync (7 new models: PlannerRun, ReqEdge, ExecScenario, Integration, SyncMap, StudySession, StudyEvent + Question.utility + Conflict.taxonomy/implications).
- **Planner ablation live-seeded (GLM by Z.ai):** all 4 arms executed against the Ablation Lab project; impact-aware dominates avgUtility (193.2) and utility-per-cost (107.3); utility breakdowns materialise in the Briefing queue.
- **Graph:** 4 typed edges extracted live; reverse traversal verified (REQ-03 change → REQ-01 impacted, hop 1, via depends_on).
- **Executability:** 9 scenarios live, 2 UNDEFINED recorded as discoveries with clarifying questions.
- **Calibration:** Brier 0.0903 / ECE 0.0278 / well-calibrated verdict computed live.
- **Debt profile:** 6 dimensions live with contributions (ambiguity 20, verification 11, executability 22, others 0 on the test project).
- **Conflicts:** taxonomy + implications live (duplication · terminology · IF/impact pairs).
- **Self-audit:** 15 pass / 2 warn / 0 fail (consent coverage warns honestly on demo data).
- **Study API:** session create → NASA-TLX patch → CSV export verified end-to-end.
- **Browser-verified:** 9 Debrief instrument tabs render; Planner Lab arm buttons + formula panel; utility chips on questions (◆ utility 400/200/108/96); Executability DEFINED/UNDEFINED states; no page errors; lint + tsc clean.
- Prior verification (audit build) preserved: 141 automated audit checks, 12 agent roles exercised; report at `download/RequirementPilot_Agent_Audit_Report.docx`.
