# Modrik — zero-cost deployment provider decision (November 2026)

## Executive decision

For a **$0 demo/staging deployment**, the lowest-change stack is:

- **Web:** Render Free Web Service, using the existing Next.js standalone Node deployment.
- **Database:** Neon Free PostgreSQL, using the pooled connection string.
- **Rate limiting:** Upstash Redis Free REST API.
- **Transactional email:** Resend Free (optional; password recovery remains disabled until configured).
- **Embedding batch worker:** the gated GitHub Actions + Hugging Face TEI CPU workflow in this repository.
- **Domain/TLS:** the platform-provided HTTPS subdomain; do not buy a domain for the first deployment.

This is a prototype/staging architecture, not a promise of production-grade uptime. The web service has 512 MB RAM and sleeps after 15 minutes idle; the cold start is roughly one minute. The database and Redis quotas are finite. No provider resource has been provisioned by this change.

## Provider comparison

| Layer | Candidate | Free allowance / constraint | Decision |
|---|---|---|---|
| Next.js web | Render Free | 512 MB RAM; spins down after 15 minutes idle; cold start about one minute; ephemeral filesystem | **Selected for lowest migration effort**; use external Postgres, never local SQLite or uploaded local files |
| Next.js web | Koyeb Free | One free web service; 512 MB RAM, 0.1 vCPU, 2 GB ephemeral SSD; scales to zero after one hour; no volumes and no worker service | Viable alternative; longer idle window, but same severe CPU/RAM and no persistent volume |
| Next.js web | Google Cloud Run | Free monthly allowance includes 180,000 vCPU-seconds, 360,000 GiB-seconds and 2M requests for request-based services; billing account required and usage beyond quota is billable | Best technical upgrade path if a billing account and strict budget monitoring are acceptable; **not guaranteed $0** |
| Next.js web | Cloudflare Workers Free | 100,000 requests/day, 10 ms CPU/request, 128 MB memory and 64 MiB Worker bundle limit | Not selected for this Node/Prisma Next.js application; the CPU/memory/runtime constraints are too restrictive |
| Next.js web | Vercel Hobby | Hobby terms limit use to personal, non-commercial projects | Do not use for a product intended for commercial use |
| PostgreSQL | Neon Free | 1 GB storage/project; 100 CU-hours/project/month; 5 GB public transfer; scale-to-zero after 5 minutes; up to 2 CU | **Selected**; normal PostgreSQL connection strings and a larger free storage/compute envelope than Supabase |
| PostgreSQL | Supabase Free | 500 MB database/project; 5 GB egress; free projects can pause after seven days of low activity; no automatic backups/PITR on Free | Good alternative if its extra platform features matter; pause risk makes it second choice |
| Redis | Upstash Free | One free database; 250 MB data; 10 GB bandwidth/month; 500K commands/month | **Selected**; matches the app's existing REST integration |
| Email | Resend Free | 3,000 emails/month, 100/day, up to 3 domains | **Selected** because the app already integrates with Resend |
| Email | Brevo Free | 300 sends/day, including transactional email; free messages carry Brevo branding | Alternative if daily volume matters more than branding and integration changes |

## Why this stack

1. Neon is the best fit for Modrik's PostgreSQL requirement at $0: 1 GB storage and 100 CU-hours per project per month, with scale-to-zero. Use pooled connections for the web service and a direct connection only where a migration/administrative task requires it.
2. Upstash is already the expected REST-based Redis integration. The 500K-command quota is adequate for a small pilot if rate-limit usage is monitored.
3. Resend requires the least code change because password recovery already supports it. Its 100-email/day cap is adequate for early testing. If email is not configured, password recovery remains unavailable; this must be stated in the UI.
4. Render requires the least deployment architecture change and supports the existing Node standalone output. The trade-off is cold start and a small memory/CPU envelope.
5. The embedding worker is batch-based and runs on GitHub-hosted runners. It must not be deployed as a Render/Koyeb free background worker.

## Hard constraints and risks

- **No local persistence:** Render/Koyeb free filesystems are ephemeral. Do not store production SQLite databases, user uploads, evidence attachments or durable artifacts on the web container. The current deployment must use PostgreSQL. If durable file uploads are added, select object storage separately.
- **No automatic production schema push:** `db:push` is for disposable environments only. The guarded migration entry point remains blocked until a reviewed provider-specific baseline and runner exist. Do not bypass it.
- **No always-on worker on the web host:** use the gated GitHub Actions worker for embedding outbox batches. It requires a PostgreSQL URL in `MODRIK_WORKER_DATABASE_URL` and the repository variable `MODRIK_EMBEDDING_WORKER_ENABLED=true`.
- **Semantic search query inference:** the GitHub Actions worker generates document embeddings, but the current web route still needs a reachable query-embedding endpoint. Its temporary TEI server is not reachable after the job ends. Keep semantic reads disabled until a live endpoint or browser-side embedding API is implemented.
- **LLM inference is separate:** hosting and the embedding worker do not provide a free planner/chat LLM. The configured GLM/model provider still needs valid credentials and may incur usage charges. Local Ollama is not a viable model host on 512 MB free web instances.
- **No guaranteed free AI API:** Hugging Face Inference Providers do not include free monthly inference credits for Free accounts. Do not rely on hosted HF inference as a zero-cost production dependency.
- **Quotas can change:** all free-tier allowances are snapshots, not contractual capacity. Add usage monitoring and do not enable auto-upgrades or paid resources without approval.

## Activation order

1. Create Neon PostgreSQL in a region close to the web service (Frankfurt is the first choice for this project), enable pooled connections and store the connection string in the host's secret manager.
2. Create Upstash Redis and configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Deploy the Next.js standalone web service to Render Free and configure all required secrets. Do not deploy until the production environment validation passes.
4. Configure Resend only if password recovery email is required; verify a sender domain or use a provider-approved sender.
5. Register GitHub OAuth App and Atlassian 3LO apps after the public HTTPS callback origin exists; configure their secrets without committing them.
6. Configure the GitHub Actions worker secret/variable only after PostgreSQL is deployed. First run a manual backfill in staging, then enable the scheduled worker.
7. Keep semantic reads disabled until a query inference path and human-judged Arabic/English evaluation pass.
8. Keep production migration execution blocked until the migration baseline and runner are independently reviewed.

## Sources

- Render free service limitations: https://render.com/docs/free
- Koyeb free instance limits: https://www.koyeb.com/docs/reference/instances
- Google Cloud Run pricing/free tier: https://cloud.google.com/run/pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Vercel Hobby terms: https://vercel.com/legal/terms
- Neon Free plan quotas: https://neon.com/docs/introduction/plans
- Supabase Free plan and pause behavior: https://supabase.com/pricing and https://supabase.com/docs/guides/platform/free-project-pausing
- Upstash Redis pricing: https://upstash.com/pricing/redis
- Resend pricing: https://resend.com/pricing
- Brevo Free plan limits: https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
- Hugging Face Inference Providers pricing: https://huggingface.co/docs/inference-providers/main/pricing
