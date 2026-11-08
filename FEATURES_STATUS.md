# Modrik feature and release status

**Canonical branch:** `main`  
**Verified main commit:** `0133d10145468237e1db6127737cc1b3af9910b3` (post-#56 Arabic RTL merge).  
**Latest verified CI:** #56 post-merge [Run 42394350241](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42394350241) passed `quality` and `postgres-schema`. Follow-up PR exact-head CI: #63 [Run 42426833632](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42426833632), #64 [Run 42426812092](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42426812092), #65 [Run 42405751701](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42405751701), #66 [Run 42426873607](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42426873607), #67 [Run 42406625574](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42406625574), and #68 [Run 42427686519](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42427686519) all passed both required jobs on their exact heads. These six PRs remain open and are not part of `main`.  
**Integration:** PRs #27–#56 are merged except the intentionally excluded divergent PR #47; PRs #63–#68 are open follow-ups.  
**Release status:** repository implementation is substantially complete; production is **not yet cleared** because live infrastructure, database-baseline reconciliation, staging rehearsal and external-service verification require deployment access.

This file describes canonical `main` at the verified commit above. Follow-up PRs #63–#68 are proposed changes only until merged. A green CI run verifies only the tested commit and configured CI environment; it does not prove live provider connectivity, production migration safety, participant research or a production deployment.

## 1. Implemented product capabilities

### Requirements workflow and agent system
- Six human-gated requirements-engineering stages, with twelve bounded agent roles.
- Evidence intake, Arabic-native elicitation, structured questions and recorded assumptions.
- Impact-aware planning with four planner arms and explainable utility breakdowns.
- Evidence-grounded requirement extraction, independent verification and evidence revision history.
- Ambiguity scoring and human-approved rewrites.
- Executable user stories, acceptance criteria and INVEST assessment.
- Conflict taxonomy, implications-only negotiation and explicit human resolution.
- Typed knowledge graph, provenance, reverse traceability and impact traversal.
- Decision journal, audit history and project-scoped JSON/CSV exports.

### Intelligence, quality and measurement
- Requirement quality assessment, executability simulation and gap discovery.
- Calibration (including Brier/ECE), six-dimension project health, drift, compliance and wind-tunnel instruments.
- Explainable change-effort heuristic; observed-work calibration is descriptive and is not a validated forecast.
- Reproducible four-arm planner benchmark with a deterministic 120-scenario corpus and analysis utilities.
- Blinded human-rating packet generation, consent filtering, integrity manifests and independent-rater analysis.
- Organization-memory lexical retrieval, persistent index, backfill/reconciliation/repair, governance and PostgreSQL retrieval benchmark.

### Collaboration, identity and integrations
- Stakeholder registry, positions, linked evidence, negotiation quorum and immutable participant responses.
- Organization/user identity, signed sessions, membership and project authorization, RBAC, tenant isolation, invitations and password recovery.
- Shared Redis-backed rate limiting, encrypted integration credentials and guarded secret re-encryption.
- Static-token GitHub/Jira integrations, signed webhook ingestion, idempotent delivery handling and human-reviewed drift.
- OAuth lifecycle groundwork exists in the repository, but provider activation and live OAuth verification remain deferred; static-token integration remains the supported MVP path.

### Arabic, resilience and offline work
- Arabic-first/bilingual UI, RTL switching, Egyptian Arabic evidence metadata and guarded voice intake/transcription.
- Offline evidence create/update/delete queue, IndexedDB persistence, stable idempotency keys, FIFO ordering, revision-conflict review, explicit rebase/discard, multi-tab locking and fencing-token protection.
- Pending offline work is retained until server acknowledgement or explicit discard; browser-local storage is not cross-device synchronization or separately encrypted storage.

## 2. P0 — finish MVP confidence

These are the remaining repository-quality tasks, not missing historical PRs:

1. Complete the authenticated browser journey from project creation through evidence intake, all six human approval gates and Debrief. PR #54 covers the deterministic six-stage API/agent journey; PR #67 verifies that a completed fixture reopens in authenticated Mission Control and renders Debrief provenance. The full create-to-completion browser-driven journey remains open.
2. Arabic RTL coverage for all seven authenticated workspace views at 390px and locale/direction persistence after reload is merged in PR #56. Keep broader viewport, long-content and manual visual checks in the release evidence record.
3. PR #65 adds an accessibility verification protocol; it does not execute or certify a full workspace audit. Keyboard-only, screen-reader, contrast and reduced-motion evidence still requires manual execution.
4. PR #68 adds Chromium/IndexedDB coverage for interrupted multi-tab lease takeover, stale acknowledgement rejection, and retaining queued work after a mocked 503 until a mocked 200 confirmation. PR #64 adds unit coverage for retry backoff and lifecycle deferral; browser-level lifecycle timer integration and revision-conflict recovery remain open.
5. Add representative concurrency/load checks for project, evidence, graph and organization-memory reads. Existing approval/reopen compare-and-swap tests cover focused races; broad workload/load tests remain open.
6. Review onboarding, empty/loading/error/retry states and destructive-action confirmations against real user workflows.
7. Preserve exact-head CI artifacts for every follow-up; #63–#68 currently pass their required `quality` and `postgres-schema` jobs, but these PRs are not merged.

## 3. P1 — intentionally outside MVP critical path

- Semantic/vector retrieval provider activation, embedding-worker scheduling, measured shadow parity and multilingual human-judged quality evaluation. BM25 remains the safe default.
- Production-scale indexed organization-memory backfill and measured benefit before enabling indexed serving.
- Cross-device offline replication, offline file/audio blobs and service-worker background synchronization.
- Expanded change-cost calibration with representative held-out outcomes and project/change-type segmentation.
- Advanced retention and bulk-governance workflows beyond the implemented approve/reject/archive lifecycle.
- GitHub/Jira OAuth activation, provider registrations, live provider E2E and provider-side token lifecycle.
- Real-world ASR quality evaluation for Egyptian Arabic.

## 4. Research execution — implementation is not evidence

- Run the full 120-scenario benchmark sweeps and judge sensitivity/calibration.
- Recruit independent human raters, calibrate raters, collect ratings and complete adjudication/statistical analysis.
- Conduct an approved pilot with real teams and non-synthetic observations.
- Do not describe synthetic fixtures or generated rating packets as participant results.

## 5. External operational release gates

These require real deployment accounts, infrastructure or operator authorization:

- Select and configure the hosting target, canonical HTTPS domain and deployment environments.
- Provision production PostgreSQL and reconcile its actual schema/history with a reviewed provider-specific baseline. The repository intentionally does not invent migration history.
- Configure and verify Redis, Resend sender/domain, LLM provider, session/encryption secrets and any required object storage.
- Restore-test database backups; rehearse migration, rollback and recovery on staging.
- Verify authentication, tenant isolation, rate limits, email delivery, webhooks and integration health against live providers.
- Configure monitoring, alerting, error tracking, retention and incident-response ownership.
- Complete deployment-specific security, privacy and legal review before onboarding real users.

See [docs/release-readiness-checklist.md](docs/release-readiness-checklist.md) and [docs/database-migrations.md](docs/database-migrations.md).

## 6. Integration and CI

- Historical pre-#56 canonical integration chain: **#27 → #28 → #29 → #30 → #31 → #32 → #33 → #34 → #35 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43 → #44 → #45 → #46 → #48 → #49 → #50 → #51 → #52 → #53 → #54 → #56**.
- PR #56 is merged at `0133d10145468237e1db6127737cc1b3af9910b3`; this is the canonical main SHA for the current follow-up batch.
- PR #47 remains a divergent Phase 4 replay and is intentionally excluded; do not merge it wholesale.
- PRs #63–#68 are independent, open follow-ups based on the post-#56 main commit. They have exact-head green CI but require explicit merge approval.
- Original PRs #61/#62 are older versions of the browser Debrief and interrupted offline-sync tests; current-main reapplications are #67/#68. Their diffs are superseded, but keep the old PRs open until their unique commit content is conclusively reconciled and closure is authorized.

## Release decision

**Ready for focused P0 completion and staging preparation; not production-cleared.** Do not run production schema mutation, rotate live secrets, activate OAuth/semantic retrieval, or deploy without the relevant environment, backup/restore rehearsal and explicit release authorization.



---

## Current integration snapshot — 2026-11-08 (supersedes older PR-status notes)

- Canonical `main` is verified at post-#56 merge commit `0133d10145468237e1db6127737cc1b3af9910b3`.
- PRs #63–#68 are based on that canonical main, remain open, and have exact-head `quality` + `postgres-schema` CI success.
- #67 verifies the completed deterministic agent fixture in authenticated Debrief; full browser-driven project creation and all six stages remain unverified.
- #68 verifies lease takeover, stale-owner rejection, and mocked server-confirmation behavior; it does not exercise the live application backend.
- #64 tests retry policy helpers; browser-level lifecycle scheduling/backoff remains open.
- #61/#62 are superseded in intent by #67/#68, but their old branches diverge. Do not close them until their unique commits are reconciled and closure is authorized.
- Production remains blocked on staging, database-baseline reconciliation, backup restore rehearsal, live provider verification, monitoring and security/privacy/legal sign-off. OAuth and semantic/vector retrieval activation remain deferred.
