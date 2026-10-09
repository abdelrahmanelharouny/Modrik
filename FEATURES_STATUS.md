# Modrik (مدرك) — FEATURES_STATUS

**Build:** Mission Control × Research Completion build · renamed **Modrik / مدرك** · 2026-10-10
**LLM:** every agent and instrument runs on GLM, the **default provider** of the swappable provider interface (dev item 12). Strategy is fixed, the model is hot-swappable: `RP_LLM_PROVIDER=glm | model-b | local` (env-driven, nothing hardcoded). Per product decision, no "Powered by …" branding is rendered anywhere in the UI — provider identity survives only as a technical record in the Cost Observatory and `/api/providers`.
**Dynamicity rule:** every number, status, and record in the UI is computed live from the database via `/api/telemetry`, `/api/projects/*`, and the instrument APIs — the central registry (`src/lib/registry.ts`) holds only qualitative metadata. Nothing static is rendered. **Re-audited this build:** 35 component API call sites mapped; zero hardcoded stats found; telemetry endpoint computes all figures from DB counts at request time.
**Human-in-the-loop:** the system presents findings and implications only; every verdict (answers, assumptions, selections, rewrites, conflict resolutions, imports) is a human action recorded in the immutable decision journal.

---

## 1 · COMPLETED (live in this build)

### Identity & product surface (this build)
- **Renamed to Modrik / مدرك** everywhere: central registry identity (bilingual name), page title/metadata, agent system prompts, exported artifacts (Gherkin header, GitHub issue bodies, Jira ADF text), tracker labels (`modrik`), study group vocabulary (`C_modrik`), CSV export filename, provider labels, and all code comments. Old `C_requirementpilot` study rows migrated in-place.
- **Branding purge:** all "Powered by GLM — provided by Z.ai" UI elements removed (command bar chip, hero footnote, workspace footer, debrief footer, LLM disclosure constant deleted). Replaced with product-truth lines: "human-gated · evidence-driven", "every decision journaled". Scaffold Z-logo asset replaced with a neutral Modrik mark.

### Flight-deck UX (full redesign)
- **NIGHTFLIGHT design system** — void-navy cockpit theme, aurora-teal instrument glow, plasma violet, signal amber; Space Grotesk display + JetBrains Mono telemetry; HUD corner brackets, scanlines, blueprint grid.
- **Mission Control home** — animated fleet radar, live count-up telemetry, flight-plan map, mission cards, honest capability atlas, integrations bay.
- **UX-as-journey** — animated flight-path rail (Briefing → Route Plot → Airframe → Turbulence Scan → Payload → Clearance → Debrief) with traveling marker, phase transitions, human-gate banners per phase.
- **Bilingual interface** — English/Arabic toggle with RTL direction switching (persisted; re-verified this build: `lang="ar"`, "مدرك" renders). Mobile-safe (390px re-verified after fixing payload-preview overflow in the sync console grid).

### Research core
- **6-stage agentic engine** — Questioner, Scope, Extraction (Proposer+Critic), Ambiguity, Story, Consistency agents; per-stage artifact snapshots; HITL state machine with per-stage approval gates.
- **Impact-aware Question Planner (dev item 7 — the research heart)** — `Utility = (Information Gain × Downstream Impact × Uncertainty × Risk) ÷ Asking Cost`, deterministic formula in `src/lib/planner.ts`; per-question signal scoring; budget-constrained selection; utility breakdown stamped on every question in the Briefing queue. **4-arm ablation lab** (single-shot / random / LLM-self-select / impact-aware) in the Debrief Planner Lab — every arm judged by the SAME scorer and judge on **5 metrics** (avgUtility, utilityPerCost, evidenceCoverage, redundancyRate, dialectFit). Live-seeded ablation on the Ablation Lab project: impact-aware avgUtility 193.2 vs single-shot 72.4 / random 81.3 / LLM 77.8 (utility-per-cost 107 vs 31–39). Planner is the default ELICITATION engine (`RP_PLANNER_ARM` overridable, per-run arm selector in the cockpit).
- **Uncertainty-gated asking (I1)** — ask-cost meters + fallback assumptions per question; answer / proceed-with-uncertainty / reopen; assumptions ledger surfaced in Health.
- **Impact-aware problem selection (N2)** — human-tuned impact/effort sliders with live value-ratio and evidence grounding.
- **Arabic-native-first elicitation (N7, deepened per dev item 6)** — evidence-language inspection drives the default: ALL questions targeting Arabic-speaking stakeholders are generated natively in Egyptian Arabic, fallback assumptions in the question's own language, code-switch mirroring; Arabic ambiguity lexicon; live-verified.
- **Voice-note intake (I5)** — in-browser MediaRecorder capture → WAV → GLM ASR → editable evidence (voice channel embedded in the interview flow).
- **Requirement Graph with typed edges (dev item 9)** — 6 edge kinds (`depends_on`, `conflicts_with`, `derived_from`, `refines`, `validates`, `affected_by`); LLM edge-proposal pass + conflict edges materialised from the Conflict table; **reverse impact traversal** (BFS with hop depth + path kinds) wired into the Constellation. Live-verified: change to REQ-03 correctly propagates to REQ-01 via `depends_on`.
- **RequirementExecutability simulator (dev item 8)** — concrete Given/When/Then scenarios against the baseline; **UNDEFINED = discovery**: baseline-silent scenarios recorded with undefinedReason + the clarifying question that would define them. Live-verified: 9 scenarios, 7 defined, 2 UNDEFINED with discoveries.
- **Conflict taxonomy + implications-only negotiation (dev item 10)** — 6-way taxonomy + per-direction implications (`IF … => impact`) rendered in the negotiation table; the system never picks. Re-verified live this build (negotiation table gates the Clearance approval).
- **Decomposable Health/Debt (dev item 11)** — six deterministic debt dimensions computed from the DB with per-requirement contribution drill-downs; LLM writes only the narrative around computed numbers.
- **Calibration validation (open requirement 1)** — reliability bins comparing claimed confidence vs critic-verifier outcomes, Brier score, ECE, over/under-confidence verdict. Live-verified: n=9, Brier 0.0903, ECE 0.0278.
- **Critic-verifier extraction (I3)** — confidence numbers, supported/weak verdicts with critic notes; ungrounded requirements forced to weak.
- **Evidence traceability** — every requirement carries cited evidence chips (E1…En).

### Trust spine
- **Decision journal (I12)** — immutable, every human/agent decision; exportable audit log.
- **Cost observatory (I13)** — latency, tokens, blended cost, provider id per run (provider id stays as a technical record, not branding).
- **Consent registry (G13)** — per-evidence consent flags with visual states.

### Integrations (open requirement 2 — bidirectional)
- **GitHub Issues adapter** (`src/lib/integrations.ts`) — push approved requirements as issues (MoSCoW/verify/type labels, evidence citations in body), pull open issues for human curation, connection test, idempotent push via SyncMap trace rows.
- **Jira adapter (Cloud REST v3)** — push stories as issues (ADF descriptions with acceptance criteria + refs), pull via JQL, connection test, SyncMap trace.
- **Runtime credentials** — stored server-side in the Integration table or via `RP_GITHUB_*` / `RP_JIRA_*` env fallbacks; always masked in API responses; sync console UI with config dialog, test/push/pull, sync-map list. Graceful unconfigured errors (verified live).

### Benchmarks & study (dev items 13–14)
- **arbench-v2 benchmark bank** — **120 scenarios** (8 categories × 5 domains × 3 evidence mixes), **6 gold artifact types**; hand-authored Egyptian-Arabic + code-switch seeds; deterministic assembly (`scripts/rp_bench_build.py` → `bench/`).
- **3-group user study infrastructure (dev item 14)** — StudySession/StudyEvent models; API to open sessions (A_traditional / B_unconstrained_llm / **C_modrik**), log NASA-TLX + SUS + events; anonymised CSV export (`modrik_study_export.csv`). Full IRB-ready protocol at `docs/study-protocol.md`.

### Constraint packs — dual role (dev item 10 config / I11)
- **Product role** — WCAG 2.2 / Egypt-PDPL-privacy / performance packs scan the user's requirement graph (LLM-assisted, per-pack pass/partial/fail).
- **Platform role** — deterministic self-audit (`/api/self-audit`, `src/lib/constraints.ts`): WCAG 2.2 contrast math computed from live design tokens, performance budgets from real telemetry, PDPL structure checks. Rendered in the Constraint Pack Bay. Re-verified live this build: 16 PASS.

### Production hardening
- **LLM Provider Interface (dev item 12)** — fixed strategy (retry, JSON repair, usage accounting, evidence budgets) in `agents.ts`; swappable providers (GLM via z-ai-web-dev-sdk | any OpenAI-compatible Model B | local OpenAI-compatible server for air-gapped/PDPL-resident runs); provider id recorded per run; `/api/providers` status endpoint; FEATURE_ATLAS declares it live.
- **Truncated-JSON repair; transport + parse retries; ASR script guard; evidence budget; ungrounded-requirement safety net; journal reference integrity; pack 400 validation** (all live, prompt stamp v2.1-audit).

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

## Verification record (this build, 2026-10-10 — Modrik rename + dynamicity audit)
- `tsc --noEmit`: **0 errors in src/** · `eslint`: **clean** · Prisma schema in sync (comment-level changes only).
- **Browser-verified golden path (Agent Browser):** title renders "Modrik / مدرك — MISSION CONTROL"; header shows مدرك in Arabic mode with RTL (`lang="ar"`); telemetry numbers live (2 missions, 21 requirements, 47 decisions…); demo mission lands at Debrief 7·7; all 9 instrument tabs render live data (constellation nodes E1–E3/REQ-01…12, planner ablation arms, calibration Brier/ECE, executability DEFINED/UNDEFINED, constraint packs 16 PASS, drift radar, decision journal); negotiation table gates the Clearance approval (HITL working).
- **Zero branding residue:** DOM-wide check on home and debrief — no "Powered by …" / "Z.ai" strings; `rg` sweep across `src/`, `prisma/`, `docs/`, `public/` clean.
- **Mobile 390px:** home OK; Debrief overflow (3900px) caused by payload-preview `<pre>` in the sync-console grid — fixed with `min-w-0` grid items + `whitespace-pre-wrap break-words`; re-verified `docW=390`.
- **DB migration:** 1 StudySession row migrated `C_requirementpilot` → `C_modrik`.
- **No console errors / no page errors** across the whole walk.
- Prior verification (audit + research builds) preserved: 141 automated audit checks, 12 agent roles exercised; reports in `download/`.
