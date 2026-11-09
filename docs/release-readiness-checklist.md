# Modrik — MVP release readiness checklist

This checklist separates repository work from actions that require real infrastructure. A checked CI item is not evidence that a live provider or production environment works.

## A. Repository and build gates

- [x] Canonical integration PRs #27–#46 merged into `main` in dependency order.
- [x] P0 QA PRs #48–#54 merged; #49–#54 passed exact-head CI before merge.
- [x] Exact-main CI run 42382272606 passed: quality and PostgreSQL schema jobs.
- [x] Regression suite, TypeScript, lint, production build, offline multi-tab browser test and stakeholder API/browser integration are part of CI.
- [ ] Verify post-merge `main` CI for combined PRs #49–#51 (run 42389383572 was still in progress at the time of this update).
- [x] Run full six-stage agent-pipeline integration using a deterministic local OpenAI-compatible fixture provider (PR #54, Run 42390256255).
- [ ] Re-run exact-head CI after the remaining P0 QA changes.
- [ ] Inspect and archive the final CI artifacts and test diagnostics.
- [ ] Build the final release candidate from a clean checkout using the lockfile.
- [ ] Verify the standalone output starts with production environment variables and no development-only fallback.

## B. Product acceptance

- [ ] Execute the full authenticated browser journey in [product acceptance matrix](product-acceptance-matrix.md): new organization → project → evidence → six human gates → debrief. PR #54 now exercises the real six stage agents, evidence traceability, human approvals and memory harvest through the API with a deterministic local fixture provider; organization onboarding and the Debrief UI still need one continuous browser journey.
- [ ] Verify every stage can be resumed after refresh and failed network requests can be retried safely.
- [ ] Verify evidence provenance, revisions, conflict resolution and decision journal remain consistent end-to-end.
- [ ] Verify stakeholder negotiation quorum, authority checks and immutable responses.
- [ ] Verify GitHub/Jira static-token sync, webhook signature validation and duplicate-delivery handling with test credentials.
- [x] Smoke-check all seven authenticated workspace views at 390px in English, and check tablet/desktop overflow; Arabic Briefing and Debrief at 390px are covered by PR #50.
- [ ] Extend Arabic/RTL coverage to all authenticated workspace views and verify locale persistence after reload.
- [ ] Verify Arabic language switching updates document language/direction and remains correct after reload.
- [ ] Verify keyboard-only completion, visible focus, form labels, error announcements and reduced-motion behavior. PR #48 adds skip-link, focus and form-label smoke checks; full authenticated-workspace keyboard/reduced-motion review remains open.
- [ ] Verify empty, loading, error, retry, permission-denied and destructive-confirmation states.

## C. Offline and reliability

- [ ] Verify two tabs serialize work for the same project and independent projects proceed concurrently.
- [x] Verify concurrent final approval and concurrent completed-baseline reopen have single-winner compare-and-swap semantics (PRs #51 and #52).
- [x] Verify a terminated tab's expired lease can be acquired by a new tab with a higher fencing token (PR #48 browser integration).
- [x] Verify stale lease owners cannot reacquire/release a current owner's lease (PR #48 unit coverage).
- [ ] Verify queued drafts survive browser restarts and long periods offline.
- [ ] Verify transient failures retry with bounded backoff; permanent/revision conflicts remain visible for user action.
- [ ] Verify no queued operation disappears except after server acknowledgement or explicit discard.
- [x] Verify concurrent final-stage approvals and concurrent completed-baseline reopen protection at the API level (PR #51 and PR #52 respectively; #52 is pending exact-head CI).
- [ ] Run broader API/database concurrency tests against representative project and evidence workloads.

## D. Production infrastructure

- [ ] Choose the hosting provider and deployment topology; document runtime, region, scaling and rollback.
- [ ] Provision PostgreSQL and record provider, version, schema fingerprint, migration history and critical row counts.
- [ ] Take a production-like backup and successfully restore it into an isolated environment.
- [ ] Generate and review provider-specific baseline/migration artifacts; reconcile existing DB history before applying anything.
- [ ] Configure HTTPS and the canonical `APP_URL`.
- [ ] Configure `MODRIK_ADMIN_EMAIL`, `MODRIK_ADMIN_PASSWORD_HASH`, `MODRIK_AUTH_SECRET` and `MODRIK_ENCRYPTION_KEY`.
- [ ] Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; verify connectivity from the deployed runtime.
- [ ] Configure `RESEND_API_KEY` and `PASSWORD_RESET_EMAIL_FROM`; verify sender/domain and real delivery.
- [ ] Set `RP_LLM_PROVIDER` explicitly. For `model-b`, configure HTTPS `RP_MODEL_B_BASE_URL` and `RP_MODEL_B_MODEL`; for `local`, configure `RP_LOCAL_BASE_URL` and `RP_LOCAL_MODEL`; for `glm`, set `RP_GLM_NATIVE_RUNTIME_CONFIRMED=true` only after confirming the host supplies the native SDK credentials.
- [ ] Verify bounded retries, timeouts, cost limits and provider failure handling.
- [ ] Store secrets in the hosting provider's secret manager; never commit production values or copy them into logs.
- [ ] Run `bun run security:release-check` inside the deployment environment.
- [x] Add a public, read-only database readiness probe at `GET|HEAD /api/health`; CI exercises it against the standalone production server (PR #53).
- [ ] Verify readiness probe behavior from the actual deployed runtime, plus structured logs, alerting, error reporting, retention and incident ownership.

## E. Staging release rehearsal

- [ ] Deploy to staging using the documented release procedure.
- [ ] Run migrations only after baseline reconciliation, verified backup and explicit operator approval.
- [ ] Run smoke tests for login/logout, tenant boundaries, project CRUD, evidence CRUD, all six stages and debrief.
- [ ] Verify password recovery and invitation flow with real test mailboxes.
- [ ] Verify Redis-backed rate limits across multiple application instances.
- [ ] Verify GitHub/Jira webhook signatures and static-token sync with dedicated test projects.
- [ ] Verify restore/rollback procedure, then record timings and evidence.
- [ ] Complete deployment-specific security and privacy review.

## F. Explicitly deferred from MVP

- OAuth provider activation and live GitHub/Atlassian OAuth E2E.
- Semantic/vector retrieval activation and external embedding-worker scheduling.
- Cross-device offline replication and offline file/audio storage.
- Full human-participant research execution and publication-grade analysis.

## Release authorization

A successful CI run or staging smoke test does not authorize production deployment. Production release requires a separately approved target, verified backup/restore, reconciled database baseline, real provider credentials, staging evidence and explicit release authorization.

## Current verified status — 2026-11-09

This section supersedes any older PR-number or workflow-status statements in the historical checklist above.

### Repository and automated acceptance

- [x] PRs #63–#73, #75 and #76 are merged into canonical `main` (verified main SHA: `524a3ff989135e7e7e285e33d3f1b638d230f297`).
- [x] PR #72 exact-head CI passed both `quality` and `postgres-schema` in [run 42545077703](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42545077703). It covers fresh Mission Control project creation, consented evidence, Questioner/Scope/Extraction UI runs and their first three human gates.
- [x] Original stacked PR #74 exact-head CI passed both `quality` and `postgres-schema` in [run 42546370129](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42546370129), proving the six-stage extension on its stacked tree.
- [x] PR #72 merged into `main` at `2be5bde4080615468f980171c3239fc0536d496b`.
- [x] PR #75 is the rebased one-commit follow-on for Ambiguity, Stories, Consistency, all six human approvals and Debrief; it is merged into `main` and exact-head CI [42641490698](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42641490698) passed both jobs. Original stacked PR #74 is closed as superseded.
- [x] PR #73 documentation reconciliation is merged.
- [x] PR #76 human-verification browser timing-race fix is merged after exact-head CI passed.
- [x] Final combined `main` exact-head CI passed both jobs in [run 42643067721](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42643067721).

### Product acceptance still requiring execution

- [ ] Manual keyboard-only and screen-reader review across the authenticated journey.
- [ ] Contrast, reduced-motion, target-size and visual review in both themes and both locales.
- [ ] Representative load/concurrency testing beyond focused compare-and-swap and isolated integration tests.
- [ ] Usability sessions with representative users; synthetic fixtures are not participant evidence.
- [ ] Live-provider verification and full staging rehearsal with retained evidence.

### Operational release blockers

- [ ] Hosting, domain, production PostgreSQL and Redis are provisioned and verified.
- [ ] Existing database schema/history is inventoried; a provider-specific baseline and migration runner are reviewed and tested.
- [ ] Backup restore, migration, rollback and recovery are rehearsed on staging.
- [ ] Email, LLM, session/encryption secrets, monitoring, alerting and incident ownership are configured and tested.
- [ ] Security, privacy and legal review is complete; release owner explicitly authorizes deployment.

OAuth/provider activation and semantic/vector retrieval remain intentionally deferred. No production migration or deployment is authorized by this checklist.


### Final main verification — 2026-11-09 (supersedes the historical status above)

- [x] Canonical `main` is `524a3ff989135e7e7e285e33d3f1b638d230f297`.
- [x] PRs #72, #73, #75 and #76 are merged. PR #74 is closed as superseded by #75; no unique implementation was dropped.
- [x] Final CI run [42643067721](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42643067721) completed successfully: `quality` and `postgres-schema` both green. The quality job completed regression tests, benchmark validation, release-config shape validation, SQLite schema/integration, TypeScript, lint, production build, offline browser integrations and stakeholder API/browser E2E.
- [ ] Human keyboard/screen-reader, contrast, reduced-motion and representative-user acceptance remain manual tasks.
- [ ] Staging deployment, live-provider verification, production database baseline reconciliation, backup/restore rehearsal, monitoring and security/privacy/legal sign-off remain external operational gates.
- [ ] Production deployment and production schema mutation are not authorized by this checklist.

OAuth/provider activation and semantic/vector retrieval remain intentionally deferred from the MVP.
