# Modrik feature and release status

**Canonical branch:** `main`  
**Verified main commit:** `3e42a4941fe09732836442db97d2522be57a70b6`  
**Latest verified CI:** PR #48 [Run 42385319616](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42385319616) passed; post-merge #48 [Run 42386023748](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42386023748) passed. PRs #49, #50 and #51 each passed exact-head CI before merge; main post-merge run [42389383572](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42389383572) is in progress for `3e42a4941fe09732836442db97d2522be57a70b6`.  
**Integration:** PRs #27–#46 and #48–#51 are merged. PR #47 is a divergent Phase 4 replay and is intentionally excluded. PR #52 adds completed-baseline reopen concurrency coverage and is awaiting exact-head CI.  
**Release status:** repository implementation is substantially complete; production is **not yet cleared** because live infrastructure, database-baseline reconciliation, staging rehearsal and external-service verification require deployment access.

This file describes the repository at the verified main commit above. A green CI run verifies the tested commit and configured CI environment; it does not prove live provider connectivity, production migration safety, participant research or a production deployment.

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

1. Extend the real-app Playwright journey from view-navigation smoke tests into a data-populated create → evidence → six human gates → debrief flow with real stage-agent execution. PR #50 covers all seven workspace views and responsive overflow; PR #51 covers all six API approval gates with deterministic fixtures. The complete authenticated, data-populated agent journey remains open.
2. Expand Arabic/RTL checks beyond Briefing and Debrief to all seven authenticated workspace views and validate persisted locale after reload. PR #50 covers all seven views in English at 390px, tablet/desktop overflow, and Arabic Briefing/Debrief at 390px.
3. Add repeatable accessibility checks for labels, keyboard navigation, focus visibility, landmarks, contrast and reduced motion; PR #48 covers skip-link keyboard behavior, visible focus, labels and auth-shell RTL smoke checks, but a full workspace audit and screen-reader review remain open.
4. Stress offline queue recovery after tab termination and lease expiry is now covered by PR #48; suspended-tab, interrupted-request, backoff and revision-conflict recovery still need end-to-end coverage.
5. Add representative concurrency/load checks for project, evidence, graph and organization-memory reads.
6. Review onboarding, empty/loading/error/retry states and destructive-action confirmations.
7. Re-run exact-head CI after the final P0 changes and preserve its test artifacts.

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

- Canonical merge chain: **#27 → #28 → #29 → #30 → #31 → #32 → #33 → #34 → #35 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43 → #44 → #45 → #46 → #48**.
- All twenty-one canonical PRs are merged (including #48). Do not merge the old PRs #1–#26 again; their capabilities are represented in the reconciled canonical chain.
- PR #47 is not part of the canonical chain and should not be merged wholesale.
- Verified main SHA after #48: `26c31acfd8594671d226a4a99b430fe5859de9ee`.
- PR #48 exact-head CI: [42385319616](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42385319616), with both `quality` and `postgres-schema` successful. Post-merge `main` push CI [42386023748](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42386023748) passed on `26c31acfd8594671d226a4a99b430fe5859de9ee`.

## Release decision

**Ready for focused P0 completion and staging preparation; not production-cleared.** Do not run production schema mutation, rotate live secrets, activate OAuth/semantic retrieval, or deploy without the relevant environment, backup/restore rehearsal and explicit release authorization.
