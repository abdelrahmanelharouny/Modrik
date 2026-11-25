# Durable pipeline worker

The web application only enqueues agent jobs. A separate always-on worker claims and executes them.

## Container deployment

Build the repository's `Dockerfile.worker` and run it as a long-lived container service. Supply the same `DATABASE_URL` and LLM-provider variables as the web application. Use PostgreSQL for production. Do not deploy the worker as a Vercel Function.

Expose port `8787` and configure the service health probe at `/health`. The endpoint reports readiness, active job count, completed/retried counters and a sanitized last error; it never returns credentials or database connection details.

## Runtime variables

| Variable | Default | Purpose |
|---|---:|---|
| `PIPELINE_WORKER_POLL_MS` | `1500` | Idle polling interval |
| `PIPELINE_WORKER_CONCURRENCY` | `1` | Concurrent jobs per process (1–16) |
| `PIPELINE_JOB_LEASE_MS` | `120000` | Lease duration (30 seconds–15 minutes) |
| `PIPELINE_WORKER_HEARTBEAT_MS` | `30000` | Lease heartbeat (must be shorter than half the lease) |
| `PIPELINE_JOB_MAX_ATTEMPTS` | `5` | Retry budget stored on newly enqueued jobs |
| `PORT` | `8787` | Worker health port |

Configure worker concurrency gradually; model-provider rate limits and database connection capacity are the practical bounds. Multiple worker replicas may run simultaneously because the database claim uses compare-and-swap and each claim receives a fencing token.

## Lifecycle and recovery

1. The API atomically claims the project stage and creates its `PipelineRun` and `AgentJob`; it returns HTTP 202.
2. A worker claims a queued/retry-ready job or reclaims a job whose lease expired.
3. The worker renews the lease while executing. The stage write transactions re-check and renew lease ownership in the same transaction as each write.
4. Success atomically marks the job and run complete, records the agent decision, and changes the project to `awaiting_review`.
5. Retryable failures use exponential backoff. Permanent provider authentication/configuration failures and exhausted retries move to `dead`; the project returns to `awaiting_input` so an operator can fix the cause and the user can retry.
6. A stale worker that lost its lease cannot commit a stage result or complete the job.

The queue does not auto-approve or advance human gates. A completed job only moves the project to `awaiting_review`.

## Operations

Monitor job status through `GET /api/projects/:id/pipeline`. The response contains the current project status and latest job state, retry budget, schedule, sanitized error and pipeline-run observability. Inspect dead jobs before asking users to retry; do not reset attempt counters without investigating the failure.

Schema rollout is separate from application deploy. CI tests both SQLite and PostgreSQL schema behavior using disposable databases. This branch does not create a production database baseline or execute production migrations.
