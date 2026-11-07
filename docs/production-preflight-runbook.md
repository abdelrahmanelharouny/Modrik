# Modrik — production preflight and staging runbook

**Status:** operator checklist; no production environment has been inspected or modified by this document.  
**Rule:** do not deploy, mutate a production schema, rotate live secrets or enable a deferred provider from CI or a developer workstation.

## 1. Establish the release candidate

- [ ] Record the exact release-candidate commit SHA and confirm it descends from canonical `main`.
- [ ] Confirm exact-head GitHub Actions `quality` and `postgres-schema` jobs are green; retain run URLs and artifacts.
- [ ] Build from a clean checkout using the committed lockfile and record Node/Bun versions.
- [ ] Confirm standalone output starts with production settings and has no development-only fallback.
- [ ] Confirm `RP_LLM_PROVIDER` is explicit and the selected adapter's required variables are validated by `bun run security:release-check`.

## 2. Inventory infrastructure before touching it

Record in the deployment's protected operations record (never commit secrets):

- Hosting provider, region, runtime, canonical HTTPS URL, deployment strategy and rollback owner.
- PostgreSQL provider/version, database identity, schema fingerprint, migration history, critical table counts and current backup timestamp.
- Redis endpoint identity and a successful authenticated connectivity check from the deployed runtime.
- Email sender/domain verification and a successful delivery to a controlled test mailbox.
- LLM provider/model identity, timeout/retry/cost limits and a successful bounded health request.
- Secret names, rotation owner and last-rotated timestamps only; never record secret values.
- Monitoring, alert routing, retention policy and incident-response owner.

## 3. Database baseline and recovery gate

- [ ] Freeze schema changes for the release window.
- [ ] Take a provider-native backup and restore it into an isolated database; record restore duration and verification evidence.
- [ ] Compare the live schema and migration history with the reviewed provider-specific baseline.
- [ ] Review all generated SQL, including destructive operations, with a second operator.
- [ ] Confirm the guarded migration command refuses to run without the required baseline/acknowledgement.
- [ ] Obtain explicit operator approval before running a single-writer migration job.
- [ ] Verify schema fingerprint, referential integrity and critical row counts after migration.

**Current known blocker:** the repository intentionally has no fabricated Prisma migration history. Existing databases may have been provisioned with `db push`; do not run `prisma migrate deploy` or production `db push` until actual database history is inventoried and reconciled. The current `db:migrate:deploy` guard fails closed even when its three acknowledgement variables are present: no provider-specific production migration runner is implemented yet. Treat this as a hard release blocker, not as a command that becomes safe after setting environment flags. See [database migration safety](database-migrations.md).

## 4. Staging rehearsal

- [ ] Deploy the exact candidate to isolated staging with production-like configuration and synthetic data.
- [ ] Exercise login/logout, password recovery, invitations, organization membership and cross-tenant denial.
- [ ] Exercise project/evidence CRUD, all six human gates, debrief, exports and decision journal.
- [ ] Exercise Redis-backed rate limits across at least two application instances.
- [ ] Verify GitHub/Jira static-token sync and webhook signature/deduplication with dedicated test projects.
- [ ] Verify email delivery, LLM failure handling, readiness probe, logs, alerts and error reporting.
- [ ] Rehearse rollback and backup restore; record measured timings and owner sign-off.
- [ ] Complete deployment-specific security, privacy and legal review.

## 5. Release decision

Release is blocked until all required staging and database gates above have evidence and an authorized release owner approves the candidate. A green CI run, a passing `/api/health` response in CI, or a successful local build is not production approval.

## 6. Explicitly deferred

GitHub/Atlassian OAuth activation and token lifecycle, semantic/vector retrieval activation, cross-device offline synchronization, offline audio/file blobs and publication-grade human-participant research remain outside this MVP release gate unless separately scoped and approved.
