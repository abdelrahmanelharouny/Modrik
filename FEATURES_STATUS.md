# Modrik feature and release status

**Canonical branch:** `main`  
**Verified main commit:** `f2d07f784c88195cb2f88ce2733cfe83799e7fad` (Phase 3 PR #84 and Phase 4 PR #85 merged).  
**Integration status:** PRs #63–#73, #75, #76 and Phase 3 PR #84 are merged. PRs #61 and #62 were closed as superseded by the current-main reapplications #67 and #68. Original stacked PR #74 was closed as superseded after its follow-on changes were rebased into PR #75. Phase 4 enterprise expansion is merged in PR #85; its exact-head CI evidence is recorded below. Historical PRs #77–#80 were closed as superseded after their relevant content was reconciled. PR #47 remains intentionally excluded because it is a divergent replay.  
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

### H3 — scale and resilience
- GitHub/Jira signed webhook deliveries and manual change signals enqueue durable, idempotent Change Impact jobs; independent workers analyze them with the existing lease/fencing/retry model.
- Change Impact findings are persisted per job and requirement, remain provisional, and require explicit human confirm/dismiss/resolve decisions recorded in the decision journal and organization audit.
- Organization knowledge governance supports atomic bulk archival of up to 50 accepted/rejected nodes with per-node audit entries and search-index refresh.
- Change-effort observations are stored with a database uniqueness guarantee per estimate; calibration fits earlier observations and reports absolute error on the latest temporal holdout, with change-type sample segmentation.
- Offline browser integration exercises a still-open stale tab losing its lease after a successor claims a newer fencing generation.

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
- Collect representative completed-change observations and validate temporal holdout error across multiple projects and change types before making any predictive claim.
- Advanced retention policies, reversible bulk operations and bulk deletion beyond atomic bulk archival remain deferred.
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


## Phase 4 implementation update — 2026-11-25

- Phase 3 intelligence foundations were merged through PR #84 at main commit 87d1f36f6f7f9cf5e816216f6549885bf2b8725c.
- Phase 4 enterprise product work was merged through PR #85 into main at commit f2d07f784c88195cb2f88ce2733cfe83799e7fad. The reviewed PR head was cc71f315b7b2b18b76edefd51771054368267fdf.
- Exact-head CI run [45552141618](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/45552141618) completed successfully on the reviewed PR head: both quality and postgres-schema are green, including regression tests, TypeScript, lint, production build, offline browser integrations, stakeholder API/browser E2E, SQLite integration, PostgreSQL schema parity and PostgreSQL governance/retrieval integration.
- Phase 4 implementation includes organization onboarding, portfolio workspace, plan/seat/project entitlements, idempotent usage ledger, immutable baselines and comparisons, organization AI governance, scoped legal holds, compliance export, and Stripe checkout/portal/webhook/invoice projections. Stripe remains inactive pending provider credentials and live acceptance; usage cost is estimated and token hard quotas are not yet reserved atomically.
- Legal retention policies and holds are persisted and enforced at destructive API boundaries; no automatic deletion executor runs. SSO, SCIM, MFA and enterprise identity-provider activation are not claimed complete.
- OAuth activation and semantic retrieval remain disabled by design. Granite 97M is the selected embedding candidate; BM25 remains the serving default pending human-judged multilingual evaluation.
- The deployment choices in docs/deployment-architecture.md are alternatives only: strict-$0 self-managed OCI pilot versus budget-approved managed Frankfurt hosting. No infrastructure has been provisioned.
- Release status: Phase 4 is merged; the product is still not production-cleared. Production remains blocked by PostgreSQL migration-baseline/runner work, backup/restore rehearsal, real provider acceptance, accessibility review and security/privacy/legal sign-off.
