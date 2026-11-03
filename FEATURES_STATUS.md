# Modrik feature and release status

**Snapshot:** `codex/modrik-h2-2-full-stack-reconciled`, reviewed 2026-11-03. This is a repository-level status, not a claim that external providers or a production deployment have been verified.

## Implemented in the repository

- Six-gate human-in-the-loop requirements workflow and twelve agent roles.
- Impact-aware question planner, four-arm experiment support, deterministic 120-scenario `arbench-v2` corpus, benchmark runner and analysis utilities.
- Evidence revisioning, exact-quote claim provenance, requirement-quality assessment, decision journal and typed knowledge graph with impact traversal. An initial explainable change-effort proxy is surfaced from the requirement impact graph; it is experimental and not a validated time/cost forecast.
- Executability simulation and GAP findings; ambiguity, conflict, health, calibration, drift, compliance and wind-tunnel instruments.
- Arabic-first elicitation, bilingual UI metadata, RTL switching and guarded voice intake/transcription.
- Stakeholder registry, requirement positions, evidence links and multi-stakeholder negotiation with quorum and immutable participant responses.
- Organization/project membership authorization, tenant isolation checks, signed sessions, invitations, password recovery and shared Upstash rate limiting.
- GitHub/Jira static-token integrations, encrypted credential storage, guarded credential re-encryption, and signed GitHub Issues/Push and Jira Cloud issue-created/updated/deleted webhook ingestion into drift review with encrypted per-project secrets, delivery deduplication and bounded payload normalization.
- Deterministic reverse traceability from tracker records to requirements, accepted evidence claims/revisions, knowledge nodes, user stories and upstream impact paths; tracker-to-requirement links require an explicit human-reviewed mapping or exact stable reference.
- Study participant-token infrastructure, consent-aware data handling, blinded human-rating packet creation and analysis utilities.
- Project-scoped decision-journal export as JSON/CSV with date/actor/stage/action filters, a 10,000-row cap, CSV formula-injection protection and explicit audit:read role enforcement.
- CI checks for regression tests, benchmark corpus, production configuration shape, schema parity, PostgreSQL schema validation, TypeScript, lint, production build and a focused Playwright stakeholder flow.

## Incomplete implementation / research work

- GitHub/Jira OAuth authorization and provider-side token lifecycle management.
- Offline-first evidence capture remains scoped to text-source creation; offline edits/deletes, attachment/voice blobs, cross-device sync, service-worker background sync and manual conflict resolution remain open.
- Larger full-bench ablation sweeps and publication-grade set-level judge sensitivity/calibration.
- Broader Playwright coverage for the complete six-stage product, cross-browser behavior, mobile workflows and accessibility regression.
- Offline-first evidence capture is implemented for new text sources using an IndexedDB queue, stable operation UUIDs, idempotent server intake, reconnect/manual retry and explicit duplicate-payload conflict rejection. Offline edits/deletes, file/audio blobs, cross-device sync, service-worker background sync and a full conflict-resolution UI are not implemented yet.
- Calibration and validation of the initial requirement-level change-effort proxy against observed engineering work; organization-scale knowledge memory.
- Advanced organization governance and audit-export workflows beyond current RBAC and audit primitives.
- Egyptian Arabic ASR quality remains provider-dependent; script checks and human review are guardrails, not a full upstream accuracy solution.

## External / operational gates (cannot be completed by repository code alone)

- Reconcile a provider-specific Prisma baseline against each real deployed database. The repository intentionally has no fabricated migration history; schema inventory is not a deployed-database baseline.
- Configure and verify production PostgreSQL, Redis, email delivery, LLM provider, HTTPS origins and encryption/session secrets.
- Perform and restore-test database backups; verify operational monitoring, alerting, incident response and rollback.
- Recruit pilot teams and study participants, obtain approved consent, collect non-synthetic observations and run the planned analysis. Synthetic benchmark fixtures are not participant evidence.
- Complete a security review / penetration test and legal/privacy review appropriate to the deployment jurisdictions and data collected.

## Release decision

**Not production-cleared yet.** H1 code is substantially implemented, but production database reconciliation, live provider verification and restore rehearsal are hard gates. H2 field-effectiveness and publication claims remain blocked on real participant recruitment, collection and analysis. H3 resilience and scale features are not MVP launch blockers but remain roadmap work.
