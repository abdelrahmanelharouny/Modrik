# Organization Memory — embedding model and zero-cost operating decision

**Decision:** use `BAAI/bge-m3` as the canonical embedding model for Modrik's Arabic/English organization memory. Keep lexical BM25 as the authoritative baseline and use semantic retrieval in shadow mode until a real judged evaluation demonstrates that hybrid retrieval improves relevance without weakening tenant isolation.

## Why this model fits Modrik

Modrik stores short knowledge-graph nodes (kind, label and description), not arbitrary long documents. Queries and evidence may be Arabic, English or code-switched. We need one model that handles multilingual semantic similarity without a query-instruction mismatch and can coexist with the current portable SQLite/PostgreSQL design.

| Candidate | Strengths | Trade-offs | Decision |
|---|---|---|---|
| `BAAI/bge-m3` | Multilingual; dense, sparse and ColBERT-style representations; 1,024 dimensions; up to 8,192 tokens; no query prefix required for dense retrieval | Larger/slower than small encoders; current Modrik adapter consumes dense vectors only | **Selected** |
| `intfloat/multilingual-e5-small` | Small multilingual encoder; 384 dimensions; supports 100 languages | Model card warns low-resource languages may degrade; retrieval convention uses `query:` and `passage:` prefixes, requiring adapter changes; shorter context | Lightweight fallback candidate, not primary |
| `BAAI/bge-reranker-v2-m3` | Multilingual cross-encoder reranker; useful to reorder a shortlist after retrieval | Adds a second model, inference latency and operational cost; not an embedding model and cannot replace BGE-M3 | Defer until judged evaluation proves measurable NDCG/MRR lift |
| `jinaai/jina-embeddings-v3` | Strong multilingual embedding alternative with task-specific adapters | Additional model-specific query/document task handling; no demonstrated Modrik-specific gain yet | Keep as a benchmark challenger, not a production default |

Model references:
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- Multilingual E5 Small: https://huggingface.co/intfloat/multilingual-e5-small
- BGE Reranker v2 M3: https://huggingface.co/BAAI/bge-reranker-v2-m3
- Jina Embeddings v3: https://huggingface.co/jinaai/jina-embeddings-v3

BGE-M3's model card documents 1,024-dimensional vectors, 8,192-token sequence length and multilingual dense/sparse/multi-vector support. The current implementation uses the dense vector output; sparse and ColBERT outputs are not stored and must not be claimed as active product features.

## Hugging Face hosting and actual cost

Hugging Face is the model distribution source, not a promise of free production inference. The current Inference Providers pricing documentation states that Free accounts have no included monthly inference credits; usage requires purchased credits. Therefore, a Hugging Face hosted endpoint is **not** a verified $0 production path for a Free account.

Zero recurring-cost target options:

1. **Local development:** run an OpenAI-compatible local embedding server and point `ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT` to it. The existing adapter already supports an explicitly opted-in loopback HTTP endpoint. No provider key is needed for a local server.
2. **Self-managed compute:** run a CPU/GPU embedding server on a machine already owned and controlled by the project owner. This avoids per-request provider billing but is not free in electricity, availability or maintenance.
3. **Scheduled batch execution:** use a free CI runner for bounded worker batches only if the repository's visibility/usage allowance and database connectivity permit it. This is a batch worker, not a continuously available inference API. The embedding model still has to be loaded during the job, and execution time is quota-bound.
4. **Hosted model endpoint:** easiest operationally, but paid/usage-based. Do not choose it while the hard constraint is zero cost.

A $0 deployment cannot honestly promise always-on, low-latency BGE-M3 inference on a 512 MB web-service instance. Do not load the model into the Next.js web process. Keep inference separate from web requests and run the durable outbox worker in bounded batches.

## Current implementation fit

The repository already contains:
- A provider-neutral embedding model and JSON vector storage that preserve SQLite/PostgreSQL schema parity.
- An OpenAI-compatible embedding adapter.
- A transactional embedding outbox, retry/lease worker, backfill command and content-hash validation.
- Tenant/project/model/dimension filters before vector ranking.
- A bounded exact-cosine semantic search and reciprocal-rank fusion helper.
- A judged retrieval evaluator and benchmark tooling.

The schema stores vectors as JSON to remain portable. Do not add pgvector or a new vector database merely for feature completeness: the current portable exact-scan path is simpler and preserves both database providers. Revisit pgvector/HNSW only when real corpus size and latency measurements show the bounded exact scan is no longer appropriate. A future pgvector adapter must keep tenant/project authorization inside the database query before top-K selection.

## Activation settings

The example environment now selects:
- `ORGANIZATION_MEMORY_EMBEDDING_MODEL=BAAI/bge-m3`
- `ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS=1024`

The following remain intentionally disabled until an endpoint is configured and acceptance gates pass:
- `ORGANIZATION_MEMORY_EMBEDDINGS_ENABLED=false`
- `ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=false`

The endpoint must expose the OpenAI-compatible `POST /embeddings` contract expected by the existing adapter and return the exact configured model ID and a finite 1,024-element vector. Do not point the app at a general chat-completions endpoint.

## Safe rollout sequence

1. Start with a local OpenAI-compatible BGE-M3 endpoint and run the provider unit tests plus a real smoke test against non-sensitive sample nodes.
2. Enable embedding writes only in a non-production environment; keep semantic reads disabled.
3. Run the resumable backfill for one test organization, then reconcile source hashes, model IDs, dimensions and job states.
4. Verify worker restart, lease expiry, retries, provider timeout, stale content, deletion tombstones and organization/project isolation.
5. Capture Arabic, English and code-switched queries with human-judged relevance labels. Compare BM25 against semantic and hybrid RRF using Recall@K, MRR and NDCG@K; report per-language results and confidence intervals where sample size allows.
6. Keep BM25 as the serving default unless hybrid improves judged quality and passes parity, latency and tenant-isolation gates.
7. Only then enable semantic reads for a small canary organization, with immediate rollback to BM25.

Synthetic fixtures validate code behavior; they are not evidence of retrieval quality. Do not report an accuracy percentage until real human judgments exist.

## Research sources

- Hugging Face model card — BGE-M3: https://huggingface.co/BAAI/bge-m3
- Hugging Face model card — multilingual E5 Small: https://huggingface.co/intfloat/multilingual-e5-small
- Hugging Face model card — BGE Reranker v2 M3: https://huggingface.co/BAAI/bge-reranker-v2-m3
- Hugging Face Inference Providers pricing: https://huggingface.co/docs/inference-providers/main/pricing
- Hugging Face Inference Providers overview: https://huggingface.co/docs/inference-providers/index
