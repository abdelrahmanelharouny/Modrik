# Modrik — MVP release readiness checklist

This checklist separates repository work from actions that require real infrastructure. A checked CI item is not evidence that a live provider or production environment works.

## A. Repository and build gates

- [x] Canonical integration PRs #27–#46 merged into `main` in dependency order.
- [x] P0 QA PRs #48–#51 merged; #49–#51 passed exact-head CI before merge.
- [x] Exact-main CI run 42382272606 passed: quality and PostgreSQL schema jobs.
- [x] Regression suite, TypeScript, lint, production build, offline multi-tab browser test and stakeholder API/browser integration are part of CI.
- [ ] Verify post-merge `main` CI for combined PRs #49–#51 (run 42389383572 was still in progress at the time of this update).
- [ ] Re-run exact-head CI after the remaining P0 QA changes.
- [ ] Inspect and archive the final CI artifacts and test diagnostics.
- [ ] Build the final release candidate from a clean checkout using the lockfile.
- [ ] Verify the standalone output starts with production environment variables and no development-only fallback.

## B. Product acceptance

- [ ] Execute the full authenticated product journey in [product acceptance matrix](product-acceptance-matrix.md): new organization → project → evidence → six human gates → debrief.
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
- [x] Add a public, read-only database readiness probe at `GET|HEAD /api/health`; CI exercises it against the standalone production server.
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
