# Modrik feature and release status

**Canonical branch:** `main`  
**Verified main commit:** `92563c367705317463bcf641d25bc0c95f4183ee` (PR #75 merged after PR #72).  
**Integration status:** PRs #63–#72 and #75 are merged. PRs #61 and #62 were closed as superseded by the current-main reapplications #67 and #68. Original stacked PR #74 was closed as superseded after its follow-on changes were rebased into PR #75. PR #73 is the remaining documentation reconciliation PR. PR #47 remains intentionally excluded because it is a divergent replay.  
**Release status:** the repository has broad automated coverage and a successful CI merge path, but it is **not production-cleared**. Production infrastructure, migration-baseline reconciliation, staging rehearsal, live-provider verification and operational/security sign-off remain external gates.

This document distinguishes implemented repository behavior, automated evidence, manual acceptance and external release prerequisites. A passing CI run proves only the tested commit and configured CI environment; it does not prove live-provider behavior, user acceptance or production readiness.

## 1. Implemented product capabilities

### Requirements workflow and agent system
- Six human-gated requirements-engineering stages with bounded agent roles.
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
- Calibration (including Brier/ECE), project health, drift, compliance and wind-tunnel instruments.
- Explainable change-effort heuristic; observed-work calibration is descriptive, not a validated forecast.
- Reproducible four-arm planner benchmark with a deterministic 120-scenario corpus and analysis utilities.
- Blinded human-rating packet generation, consent filtering, integrity manifests and independent-rater analysis.
- Organization-memory lexical retrieval, persistent index, backfill/reconciliation/repair, governance and PostgreSQL retrieval benchmark.

### Collaboration, identity and integrations
- Stakeholder registry, positions, linked evidence, negotiation quorum and immutable participant responses.
- Organization/user identity, signed sessions, membership and project authorization, RBAC, tenant isolation, invitations and password recovery.
- Shared Redis-backed rate limiting, encrypted integration credentials and guarded secret re-encryption.
- Static-token GitHub/Jira integrations, signed webhook ingestion, idempotent delivery handling and human-reviewed drift.
- OAuth lifecycle groundwork exists, but provider activation and live OAuth verification remain deferred; static-token integration remains the supported MVP path.

### Arabic, resilience and offline work
- Arabic-first/bilingual UI, RTL switching, Egyptian Arabic evidence metadata and guarded voice intake/transcription.
- Offline evidence create/update/delete queue, IndexedDB persistence, stable idempotency keys, FIFO ordering, revision-conflict review, explicit rebase/discard, multi-tab locking and fencing-token protection.
- Retry/backoff policy is centralized; PR #70 adds an injectable timer scheduler used by the elicitation component, with deterministic tests for lifecycle deferral, manual override, timer replacement, firing and cleanup.
- Pending offline work is retained until server acknowledgement or explicit discard. Browser-local storage is not cross-device synchronization or separately encrypted storage.

## 2. P0 — remaining product-confidence work

1. **Full browser-driven creation-to-completion journey:** PR #72 and rebased follow-on PR #75 are merged into `main`. Together they cover fresh Mission Control creation, consented evidence, all six agents, all six human approvals and Debrief provenance. PR #75 exact-head CI run [42641490698](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42641490698) passed both `quality` and `postgres-schema`. Manual accessibility/research acceptance and a clean release-candidate run remain open.
2. **Offline retry lifecycle integration:** PR #64 adds unit coverage for capped backoff, human-review classification, lifecycle deferral and manual override. The scheduler used by the actual component is covered by deterministic timer tests. A browser-level timing test across OS tab suspension/resume remains additional confidence work, not a claim of verified background execution.
3. **Offline recovery confirmation:** PR #68 verifies Chromium/IndexedDB lease takeover, fencing-token progression, stale acknowledgement rejection and queued-item retention after a local mocked 503 until a local mocked 200. This is not a live application-backend or production network test.
4. **Accessibility execution:** PR #65 adds a verification protocol. Keyboard, screen-reader, contrast and reduced-motion checks still need documented manual execution; no WCAG conformance claim is made.
5. **Concurrency/load confidence:** focused approval/reopen compare-and-swap tests exist. Representative workload/load checks for project, evidence, graph and organization-memory reads remain open.
6. **Usability validation:** review onboarding, empty/loading/error/retry states, destructive-action confirmations and longer real-world workflows with representative users.

## 3. P1 — intentionally deferred or outside the MVP critical path

- Semantic/vector retrieval provider activation, embedding-worker scheduling, measured shadow parity and multilingual human-judged quality evaluation. BM25 remains the safe default.
- Production-scale indexed organization-memory backfill and measured benefit before enabling indexed serving.
- Cross-device offline replication, offline file/audio blobs and service-worker background synchronization.
- Expanded change-cost calibration with representative held-out outcomes and project/change-type segmentation.
- Advanced retention and bulk-governance workflows beyond the implemented approve/reject/archive lifecycle.
- GitHub/Jira OAuth activation, provider registrations, live provider E2E and provider-side token lifecycle.
- Real-world ASR quality evaluation for Egyptian Arabic.

## 4. Research execution — implementation is not evidence

- Run full 120-scenario benchmark sweeps and judge sensitivity/calibration.
- Recruit independent human raters, calibrate raters, collect ratings and complete adjudication/statistical analysis.
- Conduct an approved pilot with real teams and non-synthetic observations.
- Do not describe synthetic fixtures or generated rating packets as participant results.

## 5. External operational release gates

These require real deployment accounts, infrastructure or operator authorization:

- Select and configure the hosting target, canonical HTTPS domain and deployment environments.
- Provision production PostgreSQL and reconcile its actual schema/history with a reviewed provider-specific baseline. The repository intentionally does not invent migration history; the production deploy guard currently fails closed without a provider-specific runner.
- Configure and verify Redis, Resend sender/domain, LLM provider, session/encryption secrets and any required object storage.
- Restore-test database backups; rehearse migration, rollback and recovery on staging.
- Verify authentication, tenant isolation, rate limits, email delivery, webhooks and integration health against live providers.
- Configure monitoring, alerting, error tracking, retention and incident-response ownership.
- Complete deployment-specific security, privacy and legal review before onboarding real users.

See [docs/production-preflight-runbook.md](docs/production-preflight-runbook.md), [docs/release-readiness-checklist.md](docs/release-readiness-checklist.md) and [docs/database-migrations.md](docs/database-migrations.md).

## 6. Integration and CI

- Historical canonical integration chain through the Arabic RTL baseline: **#27 → #28 → #29 → #30 → #31 → #32 → #33 → #34 → #35 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43 → #44 → #45 → #46 → #48 → #49 → #50 → #51 → #52 → #53 → #54 → #56**.
- PR #56 delivered authenticated workspace Arabic RTL coverage and locale/direction persistence.
- PRs #63–#71 are now merged into `main`, covering acceptance evidence reconciliation, offline retry reliability, accessibility/RTL protocol, production preflight, authenticated Debrief/stage cockpit browser coverage, interrupted offline-sync browser coverage and subsequent reliability/status work.
- PR #72 is merged at `2be5bde4080615468f980171c3239fc0536d496b`; exact-head CI run [42545077703](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42545077703) passed both `quality` and `postgres-schema`.
- PR #75 was a clean one-commit rebase of the follow-on browser journey directly onto `main`, containing only the incremental test change (78 additions, 3 deletions). It is now merged at `92563c367705317463bcf641d25bc0c95f4183ee`; exact-head CI run [42641490698](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42641490698) passed both jobs. Original stacked PR #74 was closed as superseded to avoid merging duplicated ancestry.
- PRs #61/#62 are closed as superseded by #67/#68. PR #47 remains excluded as a divergent replay.
- PR #72 exact-head CI run [42545077703](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42545077703) passed both `quality` and `postgres-schema`; its changes are in `main`.
- PR #75 exact-head CI run [42641490698](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42641490698) passed both jobs; its rebased incremental browser journey is now in `main`.

## Release decision

**Ready for continued P0 completion and staging preparation; not production-cleared.** Do not run production schema mutation, rotate live secrets, activate OAuth/semantic retrieval, or deploy without the relevant environment, backup/restore rehearsal and explicit release authorization.
