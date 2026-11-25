# Modrik deployment architecture decision

**Decision status:** architecture options documented; no hosting provider, account, service, database, domain, email sender, secret or production resource has been provisioned.
**Research reviewed:** 25 November 2026.
**Current constraint recorded from the zero-cost hosting proposal:** avoid recurring hosting and inference spend for the first demo/staging environment. This constraint does not make a single VM a high-availability production architecture.

## Decision summary

Modrik has two mutually exclusive operating profiles. They should not be mixed into one deployment:

1. **Strict $0 recurring-infrastructure profile — preferred for the first controlled demo/staging environment, subject to account availability.** A single Oracle Cloud Infrastructure (OCI) Always Free Ampere A1 VM is the best-capacity option in the reviewed free tiers. It is self-managed and has a single failure domain, possible capacity shortages, and idle-instance reclamation risk. Treat it as a constrained pilot host, not as production-grade high availability.
2. **Managed-operations profile — preferred when reliability and lower operations burden matter more than a hard $0 ceiling.** Render web service in Frankfurt, Neon PostgreSQL in Frankfurt, and Upstash Redis in Frankfurt form a region-aligned candidate. Render compute and any paid database/cache usage incur charges; free quotas are for evaluation/staging only. Provisioning requires explicit budget approval.

**Do not provision either topology from this document.** First finish the PostgreSQL migration baseline/runner gate, validate secrets and integrations, and complete backup/restore and rollback rehearsal.

## Option A — strict zero-recurring-cost pilot

### Reference topology

- OCI Always Free Ampere A1 VM, within the tenancy allowance of up to 2 OCPUs and 12 GB RAM total.
- PostgreSQL 16 using the generated PostgreSQL Prisma schema, on persistent block-volume storage.
- Modrik Next.js standalone server.
- The existing Upstash REST integration for shared rate limiting, using an eligible free allowance only while within provider limits. Replacing it with self-hosted Redis requires an application adapter change and separate tests; do not assume a local Redis container is a drop-in replacement.
- Optional local Hugging Face Text Embeddings Inference (TEI) CPU service using Granite 97M. Keep embedding writes and semantic reads disabled until backfill, reconciliation, tenant-isolation and human-judged retrieval gates pass.
- Caddy or equivalent HTTPS reverse proxy. Only the web entrypoint should be public; PostgreSQL, TEI and any local inference service must remain private.
- Encrypted PostgreSQL logical backups copied off the VM to a separate storage destination, with periodic restore tests.

OCI's Always Free A1 allowance is calculated from monthly OCPU and memory-hour limits and is subject to service limits and home-region availability. OCI documents a combined 200 GB boot/block-volume allowance and up to 10 TB monthly outbound transfer in the Always Free offer. Capacity for A1 shapes is not guaranteed in every home region. Oracle may reclaim an Always Free compute instance that meets its documented idle criteria over a seven-day window. Verify the current console quota before creating any resource, and never upgrade the tenancy or create resources outside the free allowance as part of this plan.

### Operating constraints and safeguards

- One VM is a single point of failure. There is no multi-zone failover, managed database SLA, managed patching, or automatic application-level PostgreSQL restore guarantee in this design.
- The owner is responsible for Linux security updates, Docker image updates, SSH hardening, ingress firewall, access control, monitoring, incident recovery and encrypted off-host backups.
- Two OCPUs are modest. Start with app + database + the current rate-limit integration. Add TEI only after measured memory/CPU checks. Do not run local LLM or ASR at the same time without load and latency evidence.
- Never expose Postgres, Redis, TEI or LLM inference ports publicly.
- A free model download does not make hosted inference free. Use local TEI on the VM for a strict-$0 inference path; an external hosted inference provider is a separate cost/credentials decision.
- If the VM is reclaimed, capacity unavailable, or restoration time is unacceptable, stop and move to the managed profile rather than silently upgrading to paid resources.

## Option B — managed regional staging / production candidate

| Layer | Candidate | Region / purpose |
|---|---|---|
| Web app | Render Web Service | Frankfurt; Next.js standalone runtime |
| PostgreSQL | Neon Postgres | AWS Europe Central 1 (Frankfurt) |
| Shared rate limiting | Upstash Redis | AWS eu-central-1 (Frankfurt) |
| Email | Resend | Transactional email, subject to sender verification and provider limits |
| DNS / TLS | Approved domain registrar + provider-managed TLS | Canonical HTTPS APP_URL |

Render's documentation lists Frankfurt as a supported service region and provides private networking between services in the same region. Neon lists Frankfurt (eu-central-1) as a Postgres region. Upstash lists Frankfurt (eu-central-1) for Redis. Keeping app and stateful services co-located reduces avoidable region crossings; actual latency from Egypt must be measured during staging.

The application service should bind to the provider's assigned port on 0.0.0.0. Use separate staging and production databases, Redis instances, secrets and provider projects. Do not share rate-limit state or credentials across environments.

This option is not a zero-cost guarantee. Verify Render compute pricing, Neon compute/storage/branch limits, Upstash request/storage quotas, email pricing, backups, observability and egress in provider dashboards before purchasing. Configure spending alerts and a hard operator budget. Do not use a free sleeping web tier for critical background workers or production availability.

## Application-specific hard gates

### PostgreSQL migration safety

- The repository has a generated PostgreSQL schema and schema-parity checks, but no reviewed production Prisma migration history / provider-specific baseline yet.
- The production migration command intentionally fails closed until the provider-specific baseline and runner are implemented and verified.
- prisma db push is permitted only in disposable CI/test databases. Never substitute it for production migration.
- Before the first staging schema change: inventory an existing database if one exists, take and restore-test a backup, generate/review a baseline, prove the migration on an empty database and a representative existing-data fixture, and serialize the single migration writer.
- Record schema fingerprints, migration checksums, row-count invariants, rollback procedure and evidence before opening a production change window.

### Secrets and runtime

Use provider secret stores only. Never commit secret values or copy them into logs. The exact required shape is enforced by bun run security:release-check. At minimum, configure distinct per-environment values for:

- DATABASE_URL (PostgreSQL in production)
- MODRIK_ADMIN_EMAIL, MODRIK_ADMIN_PASSWORD_HASH
- MODRIK_AUTH_SECRET, MODRIK_ENCRYPTION_KEY
- UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
- RESEND_API_KEY, PASSWORD_RESET_EMAIL_FROM, APP_URL
- Explicit RP_LLM_PROVIDER and only the adapter-specific settings
- Optional Stripe bundle: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and all recurring STRIPE_PRICE_TEAM, STRIPE_PRICE_BUSINESS, STRIPE_PRICE_ENTERPRISE IDs together
- Optional GitHub / Atlassian OAuth client ID-secret pairs and matching HTTPS MODRIK_APP_URL; OAuth activation remains deferred until provider registration and live acceptance are explicitly approved.

### Model and organization-memory rollout

The repository selects ibm-granite/granite-embedding-97m-multilingual-r2 (384 dimensions) as its first compact deployment candidate. Keep ORGANIZATION_MEMORY_EMBEDDINGS_ENABLED=false and ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=false until:

1. A real TEI endpoint returns the exact model identity and 384-dimensional finite vectors.
2. A test-organization backfill completes and reconciles source hashes, model IDs, dimensions and job leases.
3. Retry, worker restart, stale content, tombstones and tenant/project isolation are tested.
4. Human-judged Egyptian Arabic, Arabic, English and code-switched queries demonstrate that hybrid retrieval beats BM25 on Recall@K, MRR and NDCG without violating tenant isolation.
5. A canary and rollback to BM25 are rehearsed.

BM25 remains the serving default. The repository's gated embedding workflow is deliberately not scheduled/activated in this phase; no production database secret is supplied to GitHub Actions.

## Staging acceptance and release gates

- Production environment validator passes with real provider secrets stored outside Git.
- PostgreSQL migration baseline/runner passes on empty and existing-data fixtures; no schema changes are run from app startup.
- Backup restore and app rollback are rehearsed and evidenced.
- Login/logout, password recovery, organization creation/switch, invitation acceptance, tenant isolation and role permissions pass against the deployed runtime.
- Durable pipeline worker, rate limits, email delivery and webhook signatures are verified across a restart and retry.
- Stripe stays disabled until dedicated test mode, subscription lifecycle, invoice, failed-payment, duplicate and out-of-order webhook acceptance passes.
- Monitoring, alert routing, incident owner, retention/access policy and privacy/security review are complete.
- User-facing availability claims reflect the selected service's actual plan, quotas and SLA.

## Provider references

- OCI Always Free resources and quotas: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- OCI Free Tier account and quota details: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Render regions: https://render.com/docs/regions
- Render web services: https://render.com/docs/web-services
- Neon regional latency / Frankfurt Postgres: https://neon.com/demos/regional-latency
- Upstash Redis supported regions: https://upstash.com/docs/redis/features/globaldatabase
- Hugging Face Granite 97M: https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2
- Hugging Face TEI: https://huggingface.co/docs/text-embeddings-inference/quick_tour

**Current release decision:** repository implementation can be merged after exact-head CI. Neither deployment topology is provisioned or production-authorized. The migration baseline, restore rehearsal and real-provider acceptance remain hard blockers.
