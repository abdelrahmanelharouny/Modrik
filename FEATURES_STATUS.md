# Modrik feature and release status

**Snapshot:** `codex/modrik-h2-2-full-stack-reconciled`, updated 2026-11-06 at `2f23b173c7ef9b26b816eeb314ef5d68bc7938d0`. This is repository status; it does not claim external providers or a production deployment have been verified.

## Completed implementation phases

### H1 — Engineering, security and product foundation

H1 repository implementation is complete: signed sessions, organization/project membership authorization, RBAC primitives, tenant isolation, invitations and password recovery, shared rate limiting, production configuration validation, encrypted integration credentials, guarded secret re-encryption/rotation, audit primitives, and database/API foundations.

Remaining H1 items are release operations: reconcile schema history against each real deployed database, configure live provider credentials and origins, verify email/Redis/LLM services, rehearse backup/restore and rollback, and complete deployment-specific security review.

### H2 — Planner evaluation and human-evaluation research infrastructure

H2 repository implementation is complete:
- Four-arm impact-aware planner and deterministic 120-scenario `arbench-v2` corpus, runner and analysis utilities.
- Canonical blinded human-rating packets, consent filtering, immutable packet manifests and exact-byte SHA-256 integrity checks.
- Independent-rater analysis with weighted kappa, paired contrasts, bootstrap intervals, permutation tests, Holm correction and adjudication queue.
- CI validation of benchmark corpus and regression coverage for evaluation pipeline.
- PostgreSQL-backed organization-memory retrieval benchmark using real Prisma/PostgreSQL adapters, deterministic Arabic/English fixtures, quality/parity metrics, latency percentiles, scan counts, tenant-scope assertion and cleanup.

Research execution remains separate from implementation completion. Full benchmark sweeps, independent human ratings, rater calibration, adjudication and publication-grade sensitivity analysis require real execution and human participation; synthetic fixtures are not participant evidence.

## Implemented product capabilities

- Six-gate human-in-the-loop requirements workflow and twelve agent roles.
- Evidence revisioning, exact-quote claim provenance, requirement-quality assessment, decision journal and typed knowledge graph with impact traversal.
- Explainable requirement change-effort heuristic, explicitly not a validated cost/time forecast.
- Observed-work change-cost calibration: server-recomputed immutable estimate snapshots, append-only actual-hours outcomes, project-scoped journal history, transparent descriptive fit/error/rank metrics and explicit sample-readiness caveats.
- Executability simulation, ambiguity/conflict/health/calibration/drift/compliance/wind-tunnel instruments.
- Arabic-first elicitation, bilingual UI metadata, RTL switching and guarded voice intake/transcription.
- Stakeholder registry, positions, evidence links, negotiation quorum and immutable participant responses.
- GitHub/Jira static-token integrations, encrypted credentials, signed webhook ingestion, delivery deduplication and bounded payload normalization.
- Deterministic reverse traceability from tracker records to requirements, evidence claims/revisions, graph nodes, stories and upstream impact paths; mappings require human review or exact stable references.
- Project-scoped decision-journal JSON/CSV export with filters, row cap, formula-injection protection and explicit audit:read enforcement.
- Offline evidence create/update/delete queue with IndexedDB persistence, stable operation UUIDs, idempotent server intake, FIFO synchronization, capped exponential retry for transient failures, online/focus/pageshow/visibility recovery plus periodic resume checks, revision conflict review, explicit rebase/discard controls, Web Locks and IndexedDB lease fallback with fencing tokens. Pending user work no longer expires by age; only server acknowledgement or explicit discard removes it.
- Atomic compare-and-swap evidence updates/deletes and server-side idempotency ledger.
- Organization knowledge-memory lexical retrieval, persistent inverted index write-through, resumable backfill, reconciliation/repair, fail-closed readiness, streaming BM25 fallback and PostgreSQL benchmark. Indexed reads remain gated by completeness/reconciliation and are not represented as generally enabled.
- Organization governance/review queue and organization audit stream with tenant-scoped access; approver-only archive lifecycle and archive reader now preserve decision history while excluding archived knowledge from active retrieval.\n- Requirement-first Reverse Mode: inspect a requirement reference to list linked GitHub/Jira changes, evidence, claims, stories, impacted requirements and exact mapping decision trails; detailed tracker inspection remains human-reviewed and read-only.
- CI for regression, benchmark corpus, release configuration shape, SQLite/PostgreSQL schema parity, PostgreSQL schema validation and integration, TypeScript, lint, production build, stakeholder API/browser E2E and PostgreSQL retrieval benchmark.

## Remaining product and research work

### P0 — MVP quality and release confidence
- Broader Playwright journeys across all six product stages, including Arabic/RTL and responsive/mobile workflows.
- Browser-level two-tab integration now exercises the IndexedDB lease fallback: same-project serialization, strictly increasing fencing tokens, and concurrent work for independent projects. Lease expiry after tab termination, suspended-tab recovery and interrupted network synchronization remain additional stress cases.
- Accessibility regression for keyboard navigation, focus management, labels, contrast and screen-reader semantics.
- User-facing failure-state review: onboarding, organization/project creation, Briefing→Debrief, Human Gates, loading/empty/error states and recovery.
- API/database load and concurrency tests for critical project, evidence, graph and retrieval flows.

### P1 — H3 capability scale-up (not required to call the MVP functionally complete)
- Semantic/vector retrieval is not enabled or connected to an embedding provider. ADR-018 requires provider selection, tenant-filtered storage, embedding lifecycle/outbox, deletion/re-embedding and multilingual quality evaluation before rollout.
- Indexed organization-memory serving needs a production-shaped backfill/reconciliation run, shadow parity observation and measured database-scale benefit before promotion. Streaming BM25 remains the correctness fallback.
- Extend change-cost calibration with representative held-out validation, project/change-type segmentation and operator review; current metrics are descriptive in-sample only.
- Further organization governance beyond the now-implemented explicit approve/reject/archive lifecycle: retention policy, controlled bulk operations (only if explicitly authorized), and advanced audit review workflows.
- GitHub/Jira OAuth and provider-side token lifecycle management; current integration uses static tokens and signed webhooks.
- Offline file/audio blobs, cross-device queue replication and service-worker background sync are unsupported. IndexedDB is browser-local and not separately encrypted; avoid highly sensitive evidence on shared devices.
- Egyptian Arabic ASR quality remains provider-dependent; script checks and human review are guardrails, not a full upstream accuracy solution.

### Research execution
- Full 120-scenario benchmark sweeps and set-level judge sensitivity/calibration.
- Real human-rater calibration, independent ratings, adjudication and final statistical analysis.
- Pilot recruitment, approved consent, field validation with real teams and non-synthetic observations.

## External / operational release gates

These cannot be completed by repository code alone:
- Reconcile a provider-specific Prisma baseline against each real deployed database; the repository intentionally does not fabricate migration history.
- Configure and verify production PostgreSQL, Redis, email delivery, LLM provider, HTTPS origins and encryption/session secrets.
- Perform and restore-test database backups; verify monitoring, alerting, incident response and rollback.
- Complete security/penetration testing and legal/privacy review appropriate to deployment jurisdictions and collected data.
- Recruit pilot teams and study participants and run the planned research protocol.

## Integration and CI status

Canonical stacked integration path: **PR #27 → #28 → #29 → #30 → #31 → #32 → #33 → #34 → #35 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43 → #44 → #45 → #46**. These are dependent stacked PRs, not independent merge candidates. PR #47 is a divergent Phase 4 replay based on an older Phase 3 branch and is excluded from the canonical chain. See [repository-consolidation-audit.md](repository-consolidation-audit.md).

Latest verified full CI before the documentation-only audit commit:
- Commit: `3c4b6631cfda8c491960540d091c7d14d446293c`
- Workflow run: [42153766097](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42153766097) — **success** on 2026-11-06.
- Verified quality and PostgreSQL jobs, including regression, TypeScript, lint, production build, stakeholder API/browser E2E, schema parity/validation, PostgreSQL integration and PostgreSQL retrieval benchmark.

Current branch head: `99d871be8a551db9da2d1e1616ffec31239aa40a`. The audit documentation commit is newer than that successful run; its exact-head CI must be checked before treating it as verified. PR #46 remains open, Draft and unmerged. No PR was merged or closed by this status update.

## Release decision

**Not production-cleared.** H1/H2 repository implementation phases are complete. The shortest credible MVP finish path is P0 browser/mobile/accessibility/recovery QA, exact-head CI, then staging deployment and operational rehearsal. H3 semantic retrieval, cross-device offline replication and OAuth should remain outside the MVP critical path unless product requirements explicitly demand them.
