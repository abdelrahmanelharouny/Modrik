# Modrik — zero-cost hosting and model deployment decision

**Research date:** 21 November 2026  
**Hard requirement:** recurring hosting and inference infrastructure must remain at $0. Paid resources, trial credits and automatic overages are excluded.

## Executive decision

### Best overall $0-capacity option: Oracle Cloud Infrastructure Always Free

For Modrik's actual architecture, the strongest no-monthly-bill option is **one OCI Ampere A1 VM in the Always Free allowance**, with Docker Compose hosting:

- Next.js standalone web application
- PostgreSQL 16 (persistent block-volume-backed data)
- Redis (local, private network only)
- Hugging Face Text Embeddings Inference (TEI) CPU serving the selected compact embedding model
- Optional local LLM and ASR services, only after resource/load tests
- Caddy for HTTPS and reverse proxy
- Scheduled encrypted database backups to a second storage destination

The Always Free tenancy allowance is **2 OCPUs and 12 GB RAM total** for Ampere A1, 200 GB combined block-volume storage, five volume backups and 10 TB/month outbound transfer. This is materially more capable than the 512 MB / 0.1 vCPU free application-hosting tiers and avoids scale-to-zero on every request.

Official limits:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/

**This is the best capacity-per-dollar option, not the easiest operations option.** It is one self-managed VM, so Modrik must own OS patching, firewall rules, Docker updates, PostgreSQL backups/restores, monitoring and recovery.

### Important OCI caveats

1. Sign-up normally requires a mobile number and credit card for verification. Oracle says the card is not charged unless the account is upgraded. Do not upgrade the tenancy or create resources outside the Always Free allowance.
2. The home region must be chosen carefully; Always Free compute is provisioned in the home region. Jeddah and Dubai are geographically relevant candidates for Egypt, but actual free-shape capacity is not guaranteed. Oracle documents temporary "out of host capacity" errors.
3. Oracle may reclaim idle Always Free compute if CPU, network and (for A1) memory utilization all remain below 20% at the 95th percentile over a seven-day period. This is a real availability risk; do not use synthetic keep-alive traffic to evade the policy.
4. One VM is a single point of failure. Volume backups are not a complete application-level PostgreSQL backup strategy. Keep encrypted `pg_dump` backups off the VM and test restore.
5. Two OCPUs are modest. Local model inference competes with web/database CPU. Start with the embedding model only; enable local LLM/ASR after load tests.

## Alternatives and why they are not the primary recommendation

| Provider | Verified free allowance / constraints | Modrik assessment |
|---|---|---|
| **OCI Always Free A1** | 2 OCPU + 12 GB RAM total; 200 GB block volume; 10 TB outbound; idle reclaim and home-region capacity caveats | **Best capacity**; one VM can host app, DB, Redis and CPU inference |
| **Prisma Compute + Prisma Postgres** | 1M requests, 360 GB-hours memory, only 4 active vCPU-hours, 10 GB outbound; DB 200K operations and 2 GB; no usage billing/card | Best no-card managed experiment, but CPU quota is too small for sustained agent/LLM workloads; no WebSocket servers, no persistent filesystem, no built-in cron, 60s time-to-first-byte, and no free-plan DB backups |
| **Render Free + Neon Free** | Render 512 MB and sleeps after 15 minutes; ephemeral filesystem. Neon 100 CU-hours and 1 GB/project, 5 GB transfer, scale-to-zero after 5 minutes | Easiest managed demo, but cold starts and low app memory/CPU make it unsuitable for running local inference or durable local state |
| **Koyeb Free** | One web service, 512 MB, 0.1 vCPU, 2 GB ephemeral SSD; scales to zero after 1 hour; no volumes and no worker service | Too constrained for the full Modrik stack |
| **Supabase Free** | 500 MB DB, 5 GB egress; projects pause after a week of low activity; no automatic backups/PITR on Free | Good managed DB alternative, but pause and backup limits |
| **Cloud Run Free** | 180K vCPU-seconds, 360K GiB-seconds, 2M requests; billing account required and usage beyond free tier can be billed | Good managed alternative with careful budget controls, not a hard $0 guarantee |
| **Cloudflare Workers Free** | 100K requests/day, 10 ms CPU/request, 128 MB memory | Not suitable for the existing Next.js Node/Prisma server without a substantial architecture rewrite |
| **Vercel Hobby** | Hobby terms restrict use to personal, non-commercial projects | Do not use for a commercial SaaS/product |
| **Hatchable Free** | One published app; 100K function calls, 10 function-compute hours, 2 database hours, 5 GB bandwidth; proprietary platform constraints | Interesting no-card proof-of-concept, but the existing Next.js/Prisma repository would need a compatibility/provisioning proof before considering it |
| **Fly.io / Railway** | No standing free production allowance for new accounts; trial/usage pricing | Excluded from hard-$0 plan |

Official sources:
- OCI Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Prisma Compute pricing: https://www.prisma.io/docs/compute/pricing
- Prisma Compute limitations: https://www.prisma.io/docs/compute/limitations
- Prisma Compute FAQ: https://www.prisma.io/docs/compute/faq
- Render Free: https://render.com/docs/free
- Neon Free quotas: https://neon.com/docs/introduction/plans
- Koyeb instances: https://www.koyeb.com/docs/reference/instances
- Supabase free-project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Vercel terms: https://vercel.com/legal/terms
- Hatchable pricing: https://hatchable.com/pricing

## Exact Modrik deployment shape

### OCI VM resource plan

Start with one A1 VM at **2 OCPU / 12 GB RAM** and a 100–150 GB boot/data volume allocation, leaving room inside the 200 GB total Always Free block-volume quota for backups or expansion.

Proposed containers/services:
1. `web`: Next.js standalone app, port bound to localhost/private Docker network.
2. `postgres`: PostgreSQL 16 with persistent volume; use generated PostgreSQL Prisma schema.
3. `redis`: private Redis for rate limiting/queues if the app adapter is updated to support a self-hosted Redis URL; otherwise keep Upstash REST Free.
4. `tei`: Hugging Face TEI CPU serving `ibm-granite/granite-embedding-97m-multilingual-r2`.
5. `llm` (optional): llama.cpp server with a quantized Qwen model, only after CPU and concurrency tests.
6. `asr` (optional): faster-whisper-small service, only after CPU and Arabic transcription tests.
7. `caddy`: TLS termination and reverse proxy; only web is exposed publicly.

Do not expose PostgreSQL, Redis, TEI or the LLM port directly to the public internet. Use private Docker networking and firewall rules.

### AI model plan from Hugging Face

| Modrik capability | Selected model/runtime | Why it fits | Limits / activation |
|---|---|---|---|
| Semantic knowledge retrieval | `ibm-granite/granite-embedding-97m-multilingual-r2` via TEI CPU | 97M parameters, 384 dimensions, Arabic + English + code retrieval training, Apache-2.0, TEI-compatible; 60.3 Multilingual MTEB Retrieval and 60.4 Code Retrieval in IBM's published results | Start with local smoke tests and a Modrik-specific Arabic/English/code-switched judged set; re-embed before changing model identity |
| Local planner/agent LLM fallback | `Qwen/Qwen3-4B-Instruct-2507`, Q4_K_M GGUF via llama.cpp | Apache-2.0; improved instruction following, coding and tool usage; 4B model is more credible than 1.7B for structured planner tasks | Q4_K_M is about 2.5 GB; CPU-only on 2 OCPU may be slow. Do not make it the default until planner benchmark and tool-call accuracy pass |
| Lower-memory LLM fallback | `Qwen/Qwen3-1.7B`, Q4_K_M GGUF | About 1.28 GB quantized; smaller CPU/RAM footprint | Weaker reasoning and planning; use only as an emergency/demo fallback |
| Arabic/English voice transcription | `Systran/faster-whisper-small` (CTranslate2 int8 CPU) | 244M-class Whisper small; multilingual including Arabic; MIT license; purpose-built faster-whisper runtime | Requires replacing current ZAI-only ASR route with a provider adapter; benchmark Egyptian Arabic accents/noisy recordings |
| Optional reranker | `Alibaba-NLP/gte-multilingual-reranker-base` | 306M parameters, Apache-2.0, 75 languages including Arabic; 85.03 average on the cited Arabic IR leaderboard | Not needed initially; add only if judged NDCG/MRR improves enough to justify extra CPU latency |

Model sources:
- Granite 97M: https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2
- Granite ONNX/Transformers.js: https://huggingface.co/onnx-community/granite-embedding-97m-multilingual-r2-ONNX
- Granite paper: https://arxiv.org/abs/2605.13521
- Qwen3 4B Instruct: https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507
- Qwen3 4B Q4_K_M GGUF: https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF
- Qwen3 1.7B GGUF: https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF
- faster-whisper-small: https://huggingface.co/Systran/faster-whisper-small
- Whisper small: https://huggingface.co/openai/whisper-small
- GTE multilingual reranker: https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base
- Arabic IR leaderboard: https://huggingface.co/spaces/Navid-AI/The-Arabic-IR-Leaderboard

### Why Granite 97M instead of the earlier E5 Large Instruct choice

The E5 Large Instruct model is strong, but it is a 560M-class encoder and unnecessarily expensive to run continuously on a $0 CPU VM. IBM Granite 97M is the better first deployment candidate for Modrik because:
- It is about 5.8× smaller by parameter count.
- Its training explicitly includes Arabic and programming code.
- It produces compact 384-dimensional vectors.
- It has published Multilingual MTEB Retrieval 60.3 and Code Retrieval 60.4 scores.
- It is Apache-2.0, has TEI compatibility tags, and has a Transformers.js-compatible ONNX community export.
- It supports up to 32,768 tokens, though Modrik's current knowledge-node representation is much shorter.

BGE-M3 remains a quality challenger: 568M parameters, 1,024 dimensions, dense/sparse/ColBERT representations and 8,192-token context, but its runtime cost is not justified for the first free deployment. Horizon-Labs multilingual-embedding-small is another good browser/CPU challenger (141M, 1,024 dimensions, distilled from BGE-M3), but Granite is smaller and explicitly trained for code retrieval, a useful match for Modrik's technical requirements and evidence.

Published model benchmarks are not a substitute for testing Modrik's own Arabic/Egyptian Arabic, English and code-switched queries. The decision remains provisional until the in-repo evaluator and human-judged set are run.

## Free supporting services

- **Email:** Resend Free (3,000 emails/month, 100/day) for password recovery. Configure sender verification; do not promise delivery before setup.
- **Object storage:** Cloudflare R2 Free includes 10 GB-month Standard storage, 1M Class A operations, 10M Class B operations and no egress charge. Use only if Modrik adds durable file uploads; do not store user files on ephemeral application filesystems.
- **Redis:** Upstash Free includes 250 MB, 10 GB bandwidth and 500K commands/month. Alternatively, run private Redis on the OCI VM after adding a supported self-hosted Redis adapter.
- **DNS/TLS:** use a free DuckDNS subdomain pointed at the VM's ephemeral public IP and Caddy/Let's Encrypt for HTTPS. A paid custom domain is not required for the first demo. Keep the subdomain stable for GitHub/Atlassian OAuth callbacks; if the VM is terminated and recreated with a new IP, update DNS and provider callback settings.

Sources:
- DuckDNS: https://www.duckdns.org/spec.jsp
- Let's Encrypt: https://letsencrypt.org/docs/faq/
- Resend: https://resend.com/pricing
- R2: https://developers.cloudflare.com/r2/pricing/
- Upstash: https://upstash.com/pricing/redis

## Non-negotiable production safeguards

1. Do not use SQLite on the VM for production. Use PostgreSQL 16 and the committed generated PostgreSQL schema.
2. Do not use `prisma db push` on production. The existing migration guard remains fail-closed; a reviewed PostgreSQL baseline, migration runner, backup prerequisite, advisory lock/single writer and restore rehearsal are required first.
3. Do not deploy until production environment validation passes with real secrets in the host secret store.
4. Keep provider credentials out of GitHub, logs, Docker images and the repository.
5. Use HTTPS, secure cookies, strict firewall ingress, private service networking, encrypted backups and tested restore.
6. Keep semantic reads disabled until the embedding backfill is reconciled and Arabic/English retrieval evaluation passes.
7. Keep external LLM provider use disabled unless credentials and a spend limit are explicitly configured. A local Qwen fallback is not yet performance-validated.
8. Do not create OCI resources outside the Always Free allowance or upgrade the account without separate approval.

## Activation sequence

1. Confirm the user can create an OCI Free Tier account and accepts card verification; choose the home region after checking Ampere A1 availability (Jeddah/Dubai are geographic candidates, not capacity guarantees).
2. Provision only the Always Free 2 OCPU / 12 GB A1 instance and Always Free block volume. Verify the Console shows the resources as Always Free before creation.
3. Configure SSH-only administration, firewall ingress, OS updates, Docker, Caddy and monitoring.
4. Deploy PostgreSQL and restore a clean staging database; do not point production at it until the migration baseline is implemented and reviewed.
5. Deploy Modrik web service and test authentication, organization isolation, OAuth callbacks, offline behavior and all core workflow stages.
6. Deploy TEI with Granite 97M and test embedding dimensions, Arabic/English similarity and outbox retries.
7. Add local Qwen3 and faster-whisper only after CPU/RAM/latency tests; preserve provider fallback behavior.
8. Configure backups, restore rehearsal, alerting and release rollback.
9. Only then switch DNS and enable real user traffic.

**No OCI resources have been provisioned by this decision.** This document is an architecture recommendation and cost/compatibility analysis, not authorization to create a cloud account, enter payment details, upgrade billing, or deploy production data.
