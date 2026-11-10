# Modrik deployment architecture decision (proposed)

**Status:** proposed default for staging; no provider account, service, database, domain or credential has been created.
**Decision owner:** project owner must approve provider choice and any paid resources.
**Application region target:** Frankfurt (closest supported listed region to Egypt among the evaluated managed platforms; validate real latency from Egypt during staging).

## Recommended first deployment

Use a deliberately small, region-aligned managed stack:

| Layer | Proposed service | Region | Purpose |
|---|---|---|---|
| Web application | Render Web Service | Frankfurt | Next.js standalone production server |
| PostgreSQL | Neon Postgres | AWS Frankfurt (eu-central-1) | Primary application database |
| Redis | Upstash Redis | AWS Frankfurt (eu-central-1) | Shared rate limiting already required by production |
| DNS/TLS | Domain registrar DNS + Render custom domain | Global | HTTPS and canonical APP_URL |
| Email | Resend | Provider-supported | Password recovery and transactional email |

Why this combination:
- Render supports Frankfurt for web services and datastores, and supports Node.js deployments from Git-connected repositories. Keep the web service and data services in one region where possible. See https://render.com/docs/regions and https://render.com/docs/web-services.
- Neon offers a Frankfurt Postgres region and usage-based compute; its free tier is suitable for staging/prototyping, not a production durability/SLA promise. See https://neon.com/demos/regional-latency and https://neon.com/blog/new-usage-based-pricing.
- Upstash offers a Frankfurt Redis region and pay-per-command pricing; the current free tier is limited and should be treated as staging only. See https://upstash.com/docs/redis/features/globaldatabase and https://upstash.com/pricing/redis.
- This split keeps each stateful service managed and avoids operating a database/Redis server inside the app container.

## Cost guardrails (verify in vendor dashboards before provisioning)

- Render web service: current published entry paid compute is about $7/month for 0.5 CPU / 512 MB; the free tier has limitations and must not be treated as production hosting. See https://render.com/pricing and https://render.com/docs/free.
- Neon: free tier currently advertises 1 GB per project and 100 CU-hours/month; paid compute is usage-based, so set budget/usage alerts and verify connection limits before production. See https://neon.com/blog/neon-free-plan-1-gb-per-project and https://neon.com/blog/new-usage-based-pricing.
- Upstash: free tier currently advertises 256 MB and 500K commands/month; pay-as-you-go currently starts at $0.20 per 100K commands. Configure a budget and alert; exceeding free limits may cause requests to fail. See https://upstash.com/pricing/redis.
- Email, domain registration, backups beyond included retention, observability and paid production tiers are additional costs.

These are vendor-published snapshots, not a quote or guaranteed monthly total. Recheck pricing, region availability, retention, support and SLA before purchasing.

## Deployment shape

1. Connect the canonical GitHub repository to Render; deploy only the reviewed release-candidate branch to staging. Production must deploy an immutable reviewed commit, not an unpinned branch tip.
2. Build with the repository lockfile and the committed Bun/Node versions. Use the existing standalone build output; start with `bun .next/standalone/server.js` and bind to the platform-provided port on `0.0.0.0`.
3. Configure a dedicated Neon staging project and separate production project. Do not reuse staging credentials or database branches as production.
4. Create separate Upstash staging and production databases in Frankfurt. Do not share rate-limit state between environments.
5. Keep all secrets in provider secret stores. Never add real values to GitHub files, issues, build logs or this document.
6. Use HTTPS canonical `APP_URL`; verify auth cookies, password recovery links and webhook callback URLs against that origin.
7. Add a pre-deploy migration job only after the migration baseline/runner gate below is implemented and reviewed. App startup must never mutate schema.
8. Configure health checks, structured logs, error reporting, alert routing, deploy rollback and an owner for incidents.

## Required environment inventory

The existing release validator is the source of truth for required variables. At minimum, inventory these names without writing their values here:

- `DATABASE_URL` (Neon pooled/runtime URL as appropriate for Prisma; use a direct URL for migration operations if the provider requires it)
- `MODRIK_ADMIN_EMAIL`, `MODRIK_ADMIN_PASSWORD_HASH`
- `MODRIK_AUTH_SECRET`, `MODRIK_ENCRYPTION_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `RESEND_API_KEY`, `PASSWORD_RESET_EMAIL_FROM`, `APP_URL`
- Explicit `RP_LLM_PROVIDER` and only the selected adapter's variables

Use distinct, randomly generated secrets per environment. Confirm the actual accepted URL formats and connection-pool settings against the application code and provider dashboard before deployment.

## Database migration hard gate

The repository currently has no committed Prisma migration history. The current `db:migrate:deploy` script intentionally exits non-zero even when acknowledgement variables are set because no provider-specific production runner exists. Do not remove this guard or substitute `prisma db push`.

Before the first staging migration:
1. Generate a reviewed PostgreSQL baseline from the exact release-candidate schema.
2. Create a clean disposable PostgreSQL database and prove baseline creation plus forward migration from that baseline.
3. Create a representative pre-existing-data fixture; verify migration preserves rows, foreign keys, unique constraints and indexes.
4. Add checksum validation, a single-writer/advisory lock, explicit environment allow-list, dry-run/review output, backup prerequisite and post-migration schema verification.
5. Verify an existing database against the baseline before marking it applied; never stamp unknown schema as migrated.
6. Rehearse backup restore and rollback on staging before any production approval.

SQLite remains useful for local development/tests; PostgreSQL is the intended deployed database. Test both providers independently.

## Staging acceptance gate

- Clean build from exact commit and successful deploy.
- Readiness probe and logs verified from the deployed runtime.
- Login/logout, password recovery email, invitation, membership and tenant-boundary checks.
- Project/evidence CRUD, six agent stages, six human approvals, Debrief, exports and decision journal.
- Redis rate limits verified across at least two app instances.
- GitHub/Jira static-token integration and webhook signature/deduplication tested with dedicated test credentials.
- LLM timeout, provider error and cost-bound behavior tested.
- Accessibility keyboard/screen-reader/contrast/reduced-motion review recorded.
- Backup restore, rollback and incident alert drill recorded.
- No production deployment until the release owner explicitly approves.

## Alternatives considered

- **Render-only:** simpler account/network topology (web + Postgres + Redis-compatible Key Value in one vendor/region), but compare current Postgres/Key Value pricing, backup retention and service constraints before selecting it.
- **Railway:** viable integrated app/Postgres/Redis alternative; compare current usage-based cost, region placement, backups and operational controls before choosing.
- **Vercel + Neon + Upstash:** viable for Next.js, but this app uses a long-running standalone Node server and shared Redis rate limiting; Render's conventional web service is the lower-friction initial target.

## Explicitly out of scope

OAuth/provider activation and semantic/vector retrieval remain deferred. Do not add them to the deployment checklist or enable them through environment variables for this MVP.
