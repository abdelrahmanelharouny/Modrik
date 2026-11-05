# Organization Memory Search Index — rollout gate

## Decision

The current production path is exact, two-pass, tenant-scoped BM25 over keyset pages. It is the correctness baseline and remains the fallback until a persisted lexical index is both complete and lifecycle-consistent. The composite `KnowledgeNode(projectId, status, updatedAt, id)` index accelerates the authorized scan; it is not an inverted full-text index.

Do not switch the API to indexed retrieval merely because index tables exist. A partially populated index can silently hide valid accepted memories and is therefore a correctness failure, not a degraded-but-acceptable mode.

## Confirmed mutation surfaces

The branch audit confirmed these direct KnowledgeNode mutation paths:

- `src/app/api/projects/[id]/knowledge-graph/route.ts`
  - `create_node`: creates a proposed node.
  - `update_node`: updates label, description, confidence, owner and status.
  - There is no `delete_node` action in this route.
- `src/app/api/organizations/knowledge-memory/route.ts`
  - `PATCH` performs compare-and-set lifecycle transitions, including accepted/rejected/archived state changes, inside a transaction that also writes decision and organization audit records.

The graph route and organization governance route are separate write boundaries. Any index implementation must cover both; updating only the organization route would leave newly created and edited nodes stale. Before rollout, repeat a repository-wide write-path audit (including future pipeline, import, seed and administrative paths) and make all direct writes use one shared transactional index-maintenance contract.

## Provider-neutral persisted design

Use ordinary Prisma models and portable relational operations supported by SQLite and PostgreSQL; do not depend on provider-specific FTS extensions or raw dialect-specific ranking.

Recommended logical records:

- One search-document row per KnowledgeNode, with a unique `nodeId`, `projectId`, indexed `status`, normalized text, token count, content hash, normalizer version and update timestamp.
- One postings row per distinct (document, normalized term), with term frequency and document length metadata. Enforce uniqueness on (documentId, term); index term and document/project scope for lookup.
- A project-scoped index state row recording schema/normalizer version, backfill cursor, scanned/indexed counts, last reconciliation time and an explicit completeness state.

The exact physical schema must be checked against current Prisma relation conventions, cascade behavior and both schema files before migration generation. Avoid storing duplicate raw source text if it creates unnecessary sensitive-data copies; derive searchable text from the source node and retain only the minimum data required for ranking and reconciliation.

## Atomic lifecycle contract

A single shared helper must build the normalized search document and replace its postings in the same database transaction as the source mutation.

- Create: insert node, document and postings atomically.
- Content update: replace postings and document metadata atomically with the node update.
- Status transition: update the indexed status atomically; only accepted documents may enter accepted-memory ranking.
- Delete/cascade: remove the document and postings through verified cascading relations or explicit transactional cleanup.
- Project archive/delete: remove or deactivate the project scope and make it ineligible before any query can return it.
- Idempotency: recomputing an unchanged normalized content hash must not create duplicate postings.
- Failure: index-maintenance failure must roll back the source mutation; never commit source changes while silently leaving stale search state.

All reads must derive project IDs from the verified organization identity. Tenant/project and accepted-status predicates must be applied in the database query before candidate ranking and retained in every page/postings join. Never fetch global top-K and filter unauthorized projects afterward.

## Resumable backfill and completeness gate

1. Deploy schema and shared write-through maintenance while the API continues using streaming BM25.
2. Start a resumable, keyset-paginated backfill over stable (updatedAt, id) order. Store a durable cursor and progress counters per project.
3. Re-running a batch must be idempotent. A crash may repeat a batch but must not skip rows.
4. Reconcile source nodes against indexed documents using counts, missing/extra IDs, status, content hashes, normalizer version and posting counts.
5. Mark a project complete only after a full backfill and a clean reconciliation under a consistent snapshot or a safe write-fenced catch-up procedure.
6. Keep incomplete projects on streaming BM25. Never mix indexed and streamed subsets in a way that can omit candidates or double-count scores.
7. After completeness, run shadow queries and compare exact result IDs/scores against the streaming baseline. Promote only after correctness and performance gates pass.
8. Retain a kill switch and immediate streaming fallback. Normalizer-version changes require a versioned rebuild and cannot be treated as a completed index.

## Ranking and benchmark gates

The postings implementation must reproduce the current BM25 contract exactly: the same Arabic normalization, English and code-switched tokenization, document-length definition, corpus document frequency, IDF formula, K1/B constants, deterministic tie-break and accepted-only scope.

Required deterministic and integration coverage:

- Older matching records outside the newest 1,000 remain retrievable.
- Arabic diacritics, extended marks, alef/hamza variants, ya/alef-maqsura, English and code-switched terms.
- Identical corpus and query produce identical top-K IDs and scores in SQLite and PostgreSQL.
- Cross-organization and cross-project isolation is enforced before ranking.
- Create, edit, status transitions, archive and delete/cascade never leave stale or unauthorized postings.
- Interrupted backfill resumes without gaps; repeated batches remain idempotent.
- Missing/extra documents and hash mismatches prevent completeness.
- Recall@K, MRR, NDCG@K and p50/p95 latency are reported against the streaming baseline at increasing corpus sizes.

## Exit criteria

The persisted index is production-ready only when every confirmed and newly discovered write path is covered, both provider schemas pass parity and integration tests, all tenant-isolation tests pass, backfill/reconciliation proves completeness, shadow ranking matches the baseline, and measured latency improves materially without reducing recall. Until then, streaming BM25 is the authoritative retrieval path.
