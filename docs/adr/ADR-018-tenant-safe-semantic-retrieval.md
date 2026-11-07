# ADR-018: Tenant-safe semantic retrieval for organization knowledge

- Status: Accepted architecture; implementation gated
- Date: 2026-11-05
- Scope: H3 Organization Knowledge Memory

## Context

The current organization-memory endpoint reads accepted KnowledgeNode rows from projects belonging to the verified session organization. The database has no embedding columns, no vector extension, and no embedding lifecycle. LLM chat providers are not embedding providers. Enabling semantic search without a real embedding capability would create a false feature and a tenant-isolation risk.

## Decision

### Retrieval contract

Retrieval modes are lexical, semantic, and hybrid. Lexical remains the default and the only production-enabled mode. The HTTP endpoint now wires multilingual BM25 lexical ranking over a bounded, tenant-scoped candidate window of accepted KnowledgeNode records. The pure ranking module also provides bounded semantic-score validation and reciprocal-rank fusion (RRF), but semantic and hybrid modes remain offline primitives and are not exposed by the endpoint until a real embedding provider and tenant-filtered store exist.

Future provider/storage contract:

- embedQuery({ text, model, dimensions }) -> { vector, model, dimensions }
- upsertDocument({ organizationId, projectId, nodeId, contentHash, model, dimensions, vector })
- deleteDocument({ organizationId, projectId, nodeId })
- search({ organizationId, projectIds, vector, model, dimensions, limit })

The search operation MUST apply organization and authorized project filters in the database/vector query itself, before nearest-neighbor ranking and limit. Post-filtering a global top-K result is prohibited. If the store cannot guarantee pre-filtering, semantic retrieval fails closed.

### Storage and portability

Do not add pgvector as the only storage path. Modrik supports SQLite and PostgreSQL schema parity.
- PostgreSQL: evaluate a separately managed vector capability (pgvector or a dedicated tenant-aware vector store) only after deployment/extension support and query-plan behavior are verified.
- SQLite: use a portable embedding-record table plus a bounded exact cosine scan for small authorized candidate sets, or keep semantic mode unavailable. Never silently substitute an unbounded full-corpus scan.
- Keep vector data outside KnowledgeNode so model upgrades and re-embedding do not mutate reviewed knowledge content.

### Embedding lifecycle

Embedding identity is (organizationId, projectId, nodeId, contentHash, model, dimensions). Embed only accepted nodes. Content hash covers canonicalized label, description, kind and approved retrieval metadata. Re-embed on content/model/dimension changes; delete on archive, rejection, node deletion, project archival or organization access revocation. A stale or missing embedding is a miss, not permission to fall back to another tenant's vector.

Use a durable outbox/job record for retries and recovery. Jobs are idempotent, bounded, observable, and carry no raw secrets. Failed embedding work must not block governance transitions. Record provider/model/version, dimensions, content hash, timestamps, status and bounded error category; never store API keys in records.

### Provider and operational contract

Embedding providers are separate from LlmProvider; chat completion compatibility does not imply embedding compatibility. Provider configuration must be explicit and disabled by default. Enforce timeouts, bounded retries with jitter, payload limits, dimension validation, model pinning and cost/latency telemetry. Never log raw evidence or vectors.

### Ranking and evaluation

- BM25 is the lexical baseline.
- Semantic scores are validated and restricted to the authorized candidate set.
- Hybrid ranking uses reciprocal-rank fusion (RRF), avoiding incomparable raw score scales.
- Evaluate lexical, semantic and hybrid on a frozen tenant-labelled query corpus; report Recall@K, MRR, nDCG@K, latency and cost, with per-language (English, Arabic, code-switched) slices.
- Include adversarial cross-tenant canaries and archived/rejected-node cases in every integration suite.

## Security invariants

1. Tenant and project scope originate only from the verified server session.
2. Tenant/project filters are applied inside the semantic store query before candidate retrieval.
3. The final result set is intersected with the authorized accepted-node set.
4. No authorized projects means zero results and no semantic provider call.
5. Unsupported provider, unavailable store, invalid vector dimensions or missing tenant-filter capability means lexical-only operation; never fail open.
6. Client-supplied organization IDs, project IDs, model IDs or retrieval modes cannot expand authorization.

## Rollout gates

1. Select and pin an actual embedding provider/model with documented data residency and cost.
2. Implement SQLite/PostgreSQL storage adapters and schema-parity validation.
3. Implement lifecycle outbox, deletion and re-embedding workers.
4. Add SQLite/PostgreSQL integration tests for tenant pre-filtering, deletion, stale content, concurrent upserts and model migration.
5. Run a frozen multilingual retrieval benchmark and compare all three modes.
6. Only then expose a server-controlled feature flag; default remains off.

## Consequences

This commit improves the lexical baseline and establishes safe ranking primitives, but does not claim semantic search is active. The HTTP endpoint remains BM25 lexical-only until all semantic rollout gates pass. The current candidate window is capped at 1,000 most-recent accepted nodes per authorized organization query; this is a bounded baseline, not a complete recall guarantee for very large organizations.


## Implementation checkpoint (2026-11-06)

A provider-neutral server module now implements canonical content hashing, strict vector/model/dimension validation, stable embedding identity, idempotent upsert/delete work descriptions, an explicit tenant/project/model/status filter contract, and exact cosine ranking with a final accepted-node/content-hash intersection. These are deterministic primitives only: no provider call, persistent embedding table, durable outbox, or API semantic mode is active yet. The store adapter must apply the filter in its query before top-K; post-filtering a global nearest-neighbor result remains prohibited.
