# Modrik — MVP release readiness checklist

This checklist separates repository work from actions that require real infrastructure. A checked CI item is not evidence that a live provider or production environment works.

## A. Repository and build gates

- [x] Canonical integration PRs #27–#46 merged into `main` in dependency order.
- [x] Exact-main CI run 42382272606 passed: quality and PostgreSQL schema jobs.
- [x] Regression suite, TypeScript, lint, production build, offline multi-tab browser test and stakeholder API/browser integration are part of CI.
- [ ] Re-run exact-head CI after the remaining P0 QA changes.
- [ ] Inspect and archive the final CI artifacts and test diagnostics.
- [ ] Build the final release candidate from a clean checkout using the lockfile.
- [ ] Verify the standalone output starts with production environment variables and no development-only fallback.

## B. Product acceptance

- [ ] Complete a full new-organization → project → evidence → six human gates → debrief journey.
- [ ] Verify every stage can be resumed after refresh and failed network requests can be retried safely.
- [ ] Verify evidence provenance, revisions, conflict resolution and decision journal remain consistent end-to-end.
- [ ] Verify stakeholder negotiation quorum, authority checks and immutable responses.
- [ ] Verify GitHub/Jira static-token sync, webhook signature validation and duplicate-delivery handling with test credentials.
- [ ] Verify all critical flows at 390px, tablet and desktop widths.
- [ ] Verify Arabic language switching updates document language/direction and remains correct after reload.
- [ ] Verify keyboard-only completion, visible focus, form labels, error announcements and reduced-motion behavior.
- [ ] Verify empty, loading, error, retry, permission-denied and destructive-confirmation states.

## C. Offline and reliability

- [ ] Verify two tabs serialize work for the same project and independent projects proceed concurrently.
- [ ] Verify a terminated tab's expired lease can be acquired by a new tab with a higher fencing token.
- [ ] Verify stale lease owners cannot acknowledge or overwrite work after ownership changes.
- [ ] Verify queued drafts survive browser restarts and long periods offline.
- [ ] Verify transient failures retry with bounded backoff; permanent/revision conflicts remain visible for user action.
- [ ] Verify no queued operation disappears except after server acknowledgement or explicit discard.
- [ ] Run API/database concurrency tests against representative project and evidence workloads.

## D. Production infrastructure

- [ ] Choose the hosting provider and deployment topology; document runtime, region, scaling and rollback.
- [ ] Provision PostgreSQL and record provider, version, schema fingerprint, migration history and critical row counts.
- [ ] Take a production-like backup and successfully restore it into an isolated environment.
- [ ] Generate and review provider-specific baseline/migration artifacts; reconcile existing DB history before applying anything.
- [ ] Configure HTTPS and the canonical `APP_URL`.
- [ ] Configure `MODRIK_ADMIN_EMAIL`, `MODRIK_ADMIN_PASSWORD_HASH`, `MODRIK_AUTH_SECRET` and `MODRIK_ENCRYPTION_KEY`.
- [ ] Configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; verify connectivity from the deployed runtime.
- [ ] Configure `RESEND_API_KEY` and `PASSWORD_RESET_EMAIL_FROM`; verify sender/domain and real delivery.
- [ ] Configure the selected LLM provider and verify bounded retries, timeouts, cost limits and failure handling.
- [ ] Store secrets in the hosting provider's secret manager; never commit production values or copy them into logs.
- [ ] Run `bun run security:release-check` inside the deployment environment.
- [ ] Verify health endpoints, structured logs, alerting, error reporting, retention and incident ownership.

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
