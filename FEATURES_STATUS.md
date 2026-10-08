# RequirementPilot — FEATURES_STATUS

**Build:** Mission Control (NIGHTFLIGHT flight-deck rebirth) · 2026-10-09
**LLM:** every agent and instrument runs on **GLM, provided by Z.ai** (disclosed in the command bar, footer, and debrief).
**Dynamicity rule:** every number, status, and record in the UI is computed live from the database via `/api/telemetry`, `/api/projects/*`, and the instrument APIs — the central registry (`src/lib/registry.ts`) holds only qualitative metadata. Nothing static is rendered.
**Human-in-the-loop:** the system presents findings and implications only; every verdict (answers, assumptions, selections, rewrites, resolutions) is a human action recorded in the immutable decision journal.

---

## 1 · COMPLETED (live in this build)

### Flight-deck UX (full redesign)
- **NIGHTFLIGHT design system** — void-navy cockpit theme, aurora-teal instrument glow, plasma violet, signal amber; Space Grotesk display + JetBrains Mono telemetry; HUD corner brackets, scanlines, blueprint grid.
- **Mission Control home** — animated fleet radar (missions plotted by flight progress, click-to-open), live count-up telemetry, flight-plan map, mission cards with progress bars, honest capability atlas, integrations bay.
- **UX-as-journey** — the Flight: animated flight-path rail (Briefing → Route Plot → Airframe → Turbulence Scan → Payload → Clearance → Debrief) with traveling marker, phase transitions, human-gate banners per phase.
- **Bilingual interface** — English/Arabic toggle with RTL direction switching (persisted).
- **Mobile-safe** — 390px verified, no horizontal overflow.

### Research core
- **6-stage agentic engine** — Questioner, Scope, Extraction (Proposer+Critic), Ambiguity, Story, Consistency agents; per-stage artifact snapshots; HITL state machine with per-stage approval gates.
- **Uncertainty-gated asking (I1)** — ask-cost meters + fallback assumptions per question; answer / proceed-with-uncertainty / reopen; assumptions ledger surfaced in Health.
- **Impact-aware problem selection (N2)** — human-tuned impact/effort sliders with live value-ratio and evidence grounding.
- **Arabic-first elicitation (N7)** — Egyptian Arabic + code-switched evidence, Arabic ambiguity lexicon, native Arabic questions (demo E1/Q-set).
- **Voice-note intake (I5)** — in-browser MediaRecorder capture → WAV conversion → GLM ASR transcription → editable evidence (via `/api/transcribe`).
- **Critic-verifier extraction (I3)** — confidence numbers, supported/weak verdicts with critic notes.
- **Evidence traceability** — every requirement carries cited evidence chips (E1…En).

### Trust spine
- **Decision journal (I12)** — immutable, every human/agent decision; exportable audit log.
- **Cost observatory (I13)** — latency, tokens, blended cost per run (DB-tracked).
- **Consent registry (G13)** — per-evidence consent flags with visual states.

### Debrief instruments (all verified live in-browser)
- **Constellation graph** — interactive requirement constellation: ambiguity/drift-colored nodes, animated evidence-grounding edges, open/resolved conflict edges, node inspector.
- **Health decomposer (I14)** — decomposed dimensions (ambiguity debt, uncertainty ledger, conflict pressure), no magic score; LLM summary, strengths, risks, recommendations.
- **Drift radar (I8)** — change-signal sweep → impacted requirements flagged + summary; clear-flags action.
- **Constraint packs (I11)** — **WCAG 2.2** accessibility, **Egypt-PDPL-inspired** privacy, performance & resilience; per-pack pass/partial/fail with covered aspects and gap suggestions.
- **Wind tunnel (I7)** — persona-conditioned synthetic stakeholder with held-out secrets stress-testing the question set.
- **MoSCoW composition** + baseline stats (all live).
- **Exports** — baseline JSON, Gherkin `.feature` skeletons, audit log.
- **Tracker payloads** — GitHub Issues draft payloads (labels carry priority/verification) and Jira story payloads with acceptance criteria (copy/download).

### Production hardening (this build)
- **Truncated-JSON repair** — structural repair pass for long LLM outputs (found via live testing; run that failed before now completes).

### Agent audit hardening (2026-10-09 deep audit — all verified live, prompt stamp v2.1-audit)
- **Journal reference integrity** — conflict-resolution entries now log real refIds (were literally "undefined ↔ undefined"; F-01).
- **Evidence prompt budget** — per-evidence agent visibility 1,200 → 4,000 chars (16k shared budget) + explicit truncation notice; beyond-cutoff requirements now extracted (F-02).
- **ASR script guard** — `expectedLanguage` hint, script-mismatch detection + one retry + warning flag; UI review toast on Arabic voice notes (F-03 mitigation; upstream GLM ASR Arabic gap remains open).
- **Transport + parse retry** — 1 retry with backoff on transport errors; `callLLMJson` parse-retry wrapper (one unparseable-output 500 observed in ~30 live calls) (F-05).
- **Constraint-pack validation** — unknown pack names rejected with 400 + available list (silent fallback removed) (F-04).
- **Arabic-first elicitation enforcement** — ≥2 native Egyptian-Arabic questions required when evidence is Arabic-heavy (was 0/5 → 5/5 → now stable ≥4/5) (F-06).
- **Ungrounded-requirement safety net** — requirements with zero valid citations forced to `weak` + human-action note (F-08).
- **Wind-tunnel reveal enforcement** — direct probes must reveal held-out secrets; substitute-fact invention forbidden (behaviour still model-dependent — documented limitation) (F-07).
- **Shared ProjectSummary type + icon import** — 3 latent TS errors resolved; `src/` typecheck + eslint clean (F-10).

---

## 2 · IN DEVELOPMENT

- **GitHub Issues write-sync** — payloads ready; OAuth app flow + repo-scoped token write pass next.
- **Jira write-sync** — story→issue mapping ready; site auth + project key mapping next.
- **Cross-model probes** — provider abstraction (LLM Provider Interface) so the same strategy runs on GLM | Model B | local models for limited comparison runs; "strategy fixed, model changes."
- **Benchmark expansion** — arbench beyond the 10-fixture seed toward 100–150 scenarios / 8 categories / 6 gold artifact types.
- **Ablation harness UI** — the 4-arm Question-Planner experiment console (single-shot / random / LLM / impact-aware) with turns, unresolved-ambiguity, downstream-error, completeness, and user-effort metrics. The engine formula (Utility = Information Gain × Downstream Impact × Uncertainty × Risk ÷ Asking Cost) is embodied in ask-cost/fallback/impact fields; the in-platform experiment runner is the remaining piece.

---

## 3 · NOT STARTED (next tier)

- **Field pilot program** — 2–3 university software/student teams running real requirements through the platform (university research/demo deployment + public demo environment are the targets).
- **3-group user study** — A (traditional) vs B (unrestricted LLM) vs C (RequirementPilot), NASA-TLX instrumented.
- **RequirementExecutability simulation** — UNDEFINED-as-discovery executable-scenario runs surfaced as a cockpit instrument.
- **Requirement Graph typed edges** — depends_on / conflicts_with / derived_from / refinements / validated_by / affected_by with change traversal (constellation currently renders evidence + conflict edges).
- **Question-Planner 4-arm ablation runs on the benchmark** (engine support exists; runs + analysis pending).

---

## 4 · MISSING (declared gaps, honestly surfaced)

- **OAuth/token management UI** for GitHub/Jira (write-sync prerequisite).
- **Multi-stakeholder sessions** — multiple concurrent interviewees with per-persona evidence attribution.
- **Offline/low-bandwidth mode** — the platform itself should pass its own WCAG 2.2 low-bandwidth expectations.
- **Team accounts & RBAC** — missions are local to this deployment; no auth layer yet (by design for the research demo).
- **Bidirectional tracker round-trip** — status changes in GitHub/Jira flowing back into drift radar (depends on write-sync).
- **Automated regression suite** — the golden path is verified by browser agent manually per build; a scripted E2E suite (Playwright) is the missing piece for continuous validation.

---

## Verification record (this build)
- Lint clean (`eslint` 0 problems), `tsc --noEmit` clean for `src/`.
- **Deep agent audit (2026-10-09)**: 141 automated checks across 8 scripted scenarios, every one of the 12 agent roles exercised live through its API contract (GLM by Z.ai), baseline + post-fix passes; audit report at `download/RequirementPilot_Agent_Audit_Report.docx`; harness + machine-readable results preserved under `scripts/agent_tests/`.
- Browser-verified end-to-end with live GLM: demo mission flown gate-by-gate (6 agents run, 1 uncertainty assumption carried, route committed, 4 conflicts resolved by human verdicts) → baseline landed → health decomposer, drift sweep (3 impacted), WCAG 2.2 pack scan (partial), journal (21 entries), constellation interaction, tracker payloads, exports — all exercised in-browser at desktop and 390px mobile.
