# Continuous change-impact workflow

## Event ingestion

GitHub and Jira webhook handlers continue to verify the provider signature, project integration configuration and configured repository/target. Supported events are normalized into a bounded change signal (at most 2,000 characters). Each provider delivery is keyed by a SHA-256 digest of its delivery ID and project ID.

The webhook does not call the LLM. It atomically creates a SyncMap record, a PipelineRun, an AgentJob with jobKind=change_impact, and a decision-journal entry. The unique AgentJob idempotency key prevents redelivered provider events from becoming duplicate jobs. The handler returns HTTP 202 after the durable enqueue commits.

A user can submit a bounded manual signal from the Debrief Change Impact inbox. Manual requests use a random idempotency key and follow the same queue and worker path.

## Worker execution and failure handling

The ordinary independent pipeline worker handles both six-stage pipeline jobs and change-impact jobs. Change-impact execution uses the same database lease, heartbeat, fencing token, bounded retry/backoff, permanent-failure classification and dead-letter behavior. The analysis reads the project's current requirements and filters model output to known requirement references in that project.

On success, one transaction:
- upserts one finding per job and requirement reference with status pending;
- marks affected requirements as suspected without changing approval status;
- persists the analysis artifact and decision journal entry;
- marks the source SyncMap as pulled, the PipelineRun done and the AgentJob completed.

The change-impact worker does not move the six-stage pipeline forward, approve requirements, or resolve a finding automatically. A failed job leaves an operator-visible sanitized error and a failed tracker SyncMap. Redelivery of the same provider delivery ID is deduplicated to the existing job; it does not reset a dead-letter job. After correcting the cause, an operator can submit a fresh manual change signal from the inbox to trigger a new analysis.

The worker readiness endpoints /health and /healthz return 200 only while the process is not draining and a SELECT 1 database probe succeeds. A database failure returns 503.

## Human review and permissions

GET /api/projects/:id/drift returns recent change-impact jobs, tracker metadata, analysis summaries and requirement findings. POST queues a manual signal and returns 202. PATCH accepts confirm, dismiss or resolve for one finding and uses a compare-and-swap transaction; stale or repeated transitions return 409.

- Reading is protected by the project read permission.
- Manual signal submission requires project requirements-write permission.
- Confirm/dismiss/resolve requires requirements-review permission.
- Every decision is journaled; when an identity-backed organization context is available, the action is also written to the organization audit log.

A pending finding is provisional. Confirming it changes the requirement drift indicator to confirmed. Dismissing or resolving a finding removes that finding from the active set; the requirement indicator is recomputed from any remaining pending/confirmed findings. No suggested finding is silently accepted.

## Operational boundary

CI validates SQLite and PostgreSQL schema behavior using disposable databases. Production adoption still requires the reviewed database baseline/migration process, backup/restore rehearsal, and an independently deployed always-on worker with the same PostgreSQL and LLM-provider configuration as the web application. Signed live-provider webhook delivery, real-world analysis quality, alerting and queue-load capacity must be verified in staging before production rollout.
