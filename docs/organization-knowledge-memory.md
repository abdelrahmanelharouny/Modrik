# Organization Knowledge Memory — H3 retrieval and governance

## Status

The authenticated organization memory read endpoint reuses accepted KnowledgeNode records attached to projects; it does not create a second memory store. Governance transitions and the reviewer/approver queue are implemented, with a dedicated organization audit stream.

Semantic retrieval architecture is recorded in ADR-018. The implementation adds a multilingual BM25 baseline and safe lexical/semantic/hybrid ranking primitives, but semantic retrieval is not enabled or connected to an embedding provider.

## Authorization and tenant isolation

1. The route resolves the caller from the signed session cookie using the database-backed identity-session resolver.
2. The resolver revalidates the session, user, membership, organization, status and session expiry against the database.
3. Accepted-memory reads require organization:read; review-queue reads additionally require requirements:review or requirements:approve.
4. Target nodes, project lists and audit reads are scoped by verified identity.organizationId. Identities without non-empty organization, actor and role scope are rejected before Prisma queries. Client-supplied organization or project IDs are never trusted.
5. Archived projects are excluded from retrieval, review and governance.
6. Accepted-memory and review-queue serializers expose bounded, source-attributed summaries, not raw evidence or arbitrary project records.
7. Governance actions enforce their exact permission again at mutation time.

## Retrieval contract

- Query parameters: q (label/description search), kind (allowlisted node kind), limit (1–100; values outside this range are rejected).
- Default page size: 25; maximum page size: 100. Accepted and review-queue views support stable keyset pagination with an opaque versioned cursor containing a timestamp snapshot and record ID and `pagination.hasMore` / `pagination.nextCursor` response fields. The timestamp snapshot provides a deterministic (updatedAt, id) boundary and rejects stale anchors. Cursor payloads are versioned, validated, and capped at 512 URL-safe characters; they do not grant access or encode tenant scope; the verified organization/project and status predicates remain mandatory on every page. Fetches request one lookahead row to determine whether another page exists.
- Default view returns only accepted nodes.
- view=review_queue returns only in_review nodes and requires reviewer or approver permission.
- Each item retains project ID, project name and stable node-reference provenance.
- Descriptions are capped at 1,200 characters; confidence is clamped to [0, 1].
- Accepted-memory search now ranks the complete tenant-scoped, accepted-only candidate set with multilingual BM25 after Arabic normalization. Candidates are read in stable keyset pages ordered by `(updatedAt DESC, id ASC)`, retaining project, accepted-status and optional kind predicates on every page. The former 1,000-row recency window is removed, so older matching records remain eligible. Exact BM25 now runs in two keyset-paginated passes inside a serializable read transaction: pass one calculates corpus document frequency and average document length; pass two scores candidates and retains only the best K results. Each database request reads at most 250 rows by default (500 maximum). The API reports first-pass and second-pass candidate counts, total pages, pass count, batch size and retrieval snapshot time. Memory is bounded by the query-term statistics, one database page and the top-K result set rather than the complete candidate corpus. Ranked search remains a single globally ranked result set and deliberately rejects cursor pagination; independently ranking separate windows would make page order and recall misleading. A composite `(projectId, status, updatedAt, id)` index supports the scoped ordered scan in both SQLite and PostgreSQL schemas. A provider-neutral persistent inverted index now stores one normalized document and term-frequency postings per KnowledgeNode. Writes are transactional with source-node creation, edits and governance transitions. A durable per-project backfill cursor populates pre-existing nodes in bounded, restartable batches. The index is not yet active in the read path: current API ranking still uses exact two-pass streaming BM25, so no latency improvement is claimed until indexed retrieval passes shadow parity and benchmark gates. Semantic/vector search remains disabled until a provider and tenant-filtered storage adapter are selected.

## Governance and audit

Governance transitions use compare-and-set status guards inside a database transaction. The project decision-journal row and organization audit event are written in that same transaction, so a failed audit write rolls back the state change. Conflicts return HTTP 409 rather than overwriting another reviewer's decision.

The review reader is /settings/knowledge-memory. The audit reader is /settings/audit and uses a dedicated organization audit stream scoped by verified session organization. Actor email and session secrets are never serialized. Project ID is a scalar snapshot, preserving audit history if a project is deleted.

## Known boundaries and next gates

- This is project-backed retrieval, not a separately persisted organization-memory entity.
- The persistent inverted index is write-through for new and changed nodes, and existing records require the resumable per-project backfill. The read path intentionally remains streaming BM25 until index completeness, tenant-isolation tests, shadow parity and production-scale latency gates pass. No indexed-read performance claim is made yet.
- Semantic/vector search is not enabled. Follow ADR-018: provider selection, tenant-filtered storage adapters, embedding lifecycle/outbox, deletion/re-embedding and multilingual benchmark must pass before rollout.
- Governance is explicit; no bulk mutation, delete, or automatic promotion.
- PostgreSQL integration coverage creates two isolated organizations and verifies accepted-memory and audit reads cannot cross tenant boundaries. It races two compare-and-set governance transitions and injects an audit foreign-key failure to prove atomic rollback. These focused integration tests are not a substitute for production load testing.
- Real-world pilot recruitment, rater calibration and empirical H2 evaluation remain separate research gates.


## Retrieval evaluation contract

The retrieval module exposes a deterministic binary-relevance evaluator for offline corpus comparisons. It reports Precision@K, Recall@K, reciprocal rank (the per-query contribution to MRR), and NDCG@K. Duplicate result IDs are counted once at their first rank; relevance is supplied as an explicit set of judged IDs. Empty relevance sets produce zero-valued relevance metrics rather than NaN. These metrics are evaluation primitives, not evidence of production quality: benchmark reports must publish corpus composition, query/judgment counts, K, language slices (Arabic, English, code-switched), tenant-scope checks, and latency separately.


The benchmark aggregator accepts per-query ranked IDs, judged relevant IDs, K, and an optional language label. It reports macro-averaged Precision@K, Recall@K, MRR and NDCG@K, plus micro precision/recall and separate language slices (for example Arabic, English, and code-switched). Queries without relevance judgments are counted and excluded from quality averages instead of being silently treated as retrieval failures. The benchmark remains offline and deterministic; it does not claim production latency or exhaustive corpus recall.


## Persistent index backfill operations

The backfill is project-scoped and resumable. Run `npm run db:backfill:organization-memory-index` after deploying the additive schema. It processes each project's KnowledgeNode rows in stable ID order, with a default batch size of 100 (override with `--batch-size=250`, maximum 500). Each batch writes documents/postings and advances its durable project cursor in one serializable transaction. Re-running the command resumes from the last committed cursor; completed projects at the current normalizer version are skipped. A normalizer-version change restarts that project's scan from the beginning. The readiness helper blocks indexed-read rollout while any requested project is missing, stale or incomplete. This command does not activate indexed retrieval; the streaming BM25 path remains authoritative until shadow parity and benchmark gates are met.


## Indexed BM25 retrieval and rollout gate

The indexed adapter computes corpus size and average document length from accepted, current-normalizer index documents, then reads only postings matching the normalized query terms. Postings are paged by the unique `(documentId, term)` key, and each document's term frequencies are scored with the same BM25 constants and IDF formula as the streaming reference path. Candidate metadata is reloaded from KnowledgeNode using the same authorized project set and accepted status filter; the indexed document is never treated as an authorization boundary.

Indexed reads are disabled by default. Set `ORGANIZATION_MEMORY_INDEXED_READ_ENABLED=true` only after running the resumable backfill for every active project. The route checks the durable per-project readiness state inside the same serializable transaction; if any project is missing, stale or incomplete, it automatically falls back to streaming BM25. The index uses Prisma relational filters and portable scalar indexes, not provider-specific full-text extensions. Keep the streaming path as the correctness fallback until shadow comparisons and production-scale benchmark gates are approved.


### Shadow comparison rollout

For a controlled parity phase, set `ORGANIZATION_MEMORY_INDEXED_SHADOW_ENABLED=true` while leaving `ORGANIZATION_MEMORY_INDEXED_READ_ENABLED` unset. When every active project is ready, the API computes both indexed and streaming results in the same serializable transaction but continues serving the streaming result. Response telemetry includes exact rank agreement, top-K overlap/recall, maximum score delta, indexed postings scanned and indexed duration. Review representative Arabic, English and code-switched traffic before enabling indexed reads. Enabling `ORGANIZATION_MEMORY_INDEXED_READ_ENABLED=true` serves indexed results only after the same readiness gate; if the gate fails, the API falls back to streaming BM25. Shadow mode adds work to each eligible query and should be enabled for a bounded observation window, not left on indefinitely.


### Indexed retrieval execution characteristics

The indexed adapter uses two bounded-memory passes over matching postings. Pass one computes document frequency per query term; pass two streams the same `(documentId, term)` ordering, scores one document group at a time, and retains only the top-K heap/list. It therefore does not materialize the full accepted corpus or all matching documents in application memory. Corpus count and total token length come from one provider-neutral Prisma aggregate. The reported `postingsScanned` includes both passes; `firstPassPages` and `secondPassPages` expose their independent pagination cost. The deep-corpus regression compares exact BM25 scores and proves a rare match outside the most recent 1,000 records is found while the indexed candidate set remains selective.


## Persistent index reconciliation

- Indexed reads require both a completed per-project backfill and a completed full reconciliation at the current normalizer version with zero mismatches. Missing, stale, failed, or in-progress audits fail closed to streaming BM25.
- Reconciliation audits source KnowledgeNodes in stable ID keyset batches, verifies each canonical document's normalized text, token count, SHA-256 content hash, status, project and normalizer version, and compares the complete expected term-frequency map with stored postings. A second stable keyset pass detects index documents with no source node.
- Audit cursors, phase, mismatch count, normalizer version and timestamps are persisted in the per-project index state. Batches run in serializable transactions; retries are safe and compare-and-swap guards concurrent workers.
- Any source/index write invalidates the reconciliation marker in the same transaction. A completed audit is therefore a point-in-time integrity attestation, not a permanent guarantee against future changes.
- Run `npm run db:reconcile:organization-memory-index` after backfill and after repair. Use `--restart` to deliberately restart an audit. The command reports mismatch categories and never mutates source documents or postings.
- A mismatch leaves the project unreconciled and blocks indexed reads. Repair remains an explicit backfill/reindex operation; reconciliation is read-only.


## Persistent index repair operations

- Repair is a separate, explicit operation: `npm run db:repair:organization-memory-index`. It never writes to KnowledgeNode or changes governance status; canonical source rows are read-only inputs.
- Each bounded batch rechecks that the project still exists and is not archived inside a Serializable transaction. Source nodes are keyset-paged by ID and their derived document/postings are rebuilt through the same transactional writer used by normal source mutations.
- A second keyset pass removes orphan search documents only after confirming that no source node exists in the same project. Their postings are deleted before the orphan document, and the reconciliation certificate is invalidated in the same transaction.
- The command is idempotent and safe to restart from the beginning after interruption. It retries serialization/deadlock conflicts up to three times and reports per-batch progress. It does not claim readiness when it finishes.
- Always run `npm run db:reconcile:organization-memory-index` after repair. The index remains fail-closed for reads until a full current-version audit completes with zero mismatches. Do not run repair against production until the additive schema is deployed, a backup/rollback plan exists, and the operator has approved the maintenance window.


## Retrieval readiness and fallback telemetry

Ranked accepted-memory responses expose `indexedReadiness` without leaking project identifiers: whether the gate was checked, whether it is ready, and the total/ready project counts. `indexedFallbackReason` explains why streaming BM25 remained authoritative, with distinct reasons for disabled indexed reads, missing index state, stale backfill normalizer, incomplete backfill, reconciliation mismatch, stale reconciliation normalizer, failed reconciliation and an in-progress reconciliation. In shadow-only mode the response explicitly reports that streaming remains authoritative by design. Shadow parity, posting scan count and indexed duration remain separately reported when a comparison actually ran. Indexed serving also exposes its two posting-pass page counts and total postings scanned through the retrieval diagnostics. These fields are diagnostics, not authorization inputs and not a claim that indexed retrieval is enabled.


## Retrieval benchmark harness

- Run `npm run bench:organization-memory` for the default 1k/10k synthetic corpus comparison, or pass `-- --sizes=1000,10000,50000 --repeats=5` to vary corpus size and repetitions.
- The harness runs the real streaming and persistent-indexed BM25 ranking functions against deterministic, provider-shaped in-memory adapters; it reports macro/micro Precision@K, Recall@K, MRR, NDCG@K, per-language quality, exact rank parity, top-K overlap, score delta, p50/p95/mean latency and candidate/posting scan counts.
- The generated report labels its environment as `synthetic-in-memory-adapters`. Timings are algorithm/adapter comparisons only; they are not database latency, production recall, or a release gate. Use a seeded, consented, judged corpus and real PostgreSQL/SQLite load tests before rollout decisions.
- The benchmark includes English and Arabic queries, multiple project scopes, accepted-only relevance judgments, and deterministic IDs/timestamps. Proposed nodes are deliberately excluded from the authorized corpus.
