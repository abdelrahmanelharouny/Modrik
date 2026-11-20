# Organization Memory — embedding model and zero-cost operating decision

**Decision:** use `intfloat/multilingual-e5-large-instruct` as Modrik's canonical embedding model. It is multilingual (Arabic and English included), 1,024-dimensional, and explicitly listed as compatible with Hugging Face Text Embeddings Inference (TEI). Keep lexical BM25 as the authoritative baseline and use semantic retrieval in shadow mode until a real judged evaluation demonstrates that hybrid retrieval improves relevance without weakening tenant isolation.

## Why this model fits Modrik

Modrik stores short knowledge-graph nodes (kind, label and description), not arbitrary long documents. Queries and evidence may be Arabic, English or code-switched. The E5 large instruct model has 24 XLM-RoBERTa layers, 1,024-dimensional embeddings, and a 512-token limit. That context limit is sufficient for the current compact knowledge-node representation. Its model card explicitly specifies a task instruction on the query side and no instruction on the document side; the provider adapter now applies that distinction.

| Candidate | Strengths | Trade-offs | Decision |
|---|---|---|---|
| `intfloat/multilingual-e5-large-instruct` | 94 languages shown on the Hub page (Arabic included); 1,024 dimensions; 560M-class XLM-R encoder; official TEI compatibility; task-specific query instructions | Larger/slower than small encoders; query must carry a one-sentence task instruction; 512-token maximum | **Selected for the first TEI-backed deployment** |
| `BAAI/bge-m3` | Multilingual; dense, sparse and ColBERT-style representations; 1,024 dimensions; up to 8,192 tokens; no query prefix required for dense retrieval | Not currently listed in TEI's official supported-model examples; requires a compatible FlagEmbedding/alternative serving runtime; current Modrik adapter consumes dense vectors only | Strong challenger for a later controlled benchmark, not the initial deployment default |
| `intfloat/multilingual-e5-small` | Small multilingual encoder; 384 dimensions; supports 100 languages | Model card warns low-resource languages may degrade; 512-token limit; query/passage prefixes must be handled correctly; TEI compatibility should be verified against the chosen image | Lower-memory fallback if the large model proves too slow |
| `Alibaba-NLP/gte-multilingual-reranker-base` | Multilingual cross-encoder reranker and listed by TEI as a supported reranking model | Adds a second model and inference latency; reranking is not needed until we have a judged candidate set | **Preferred future reranker candidate**, only if evaluation proves a measurable gain |
| `jinaai/jina-embeddings-v3` | Strong multilingual embedding alternative | Model-specific task adapters and serving compatibility need separate verification | Keep as a benchmark challenger |

Model references:
- E5 Large Instruct: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- E5 Small: https://huggingface.co/intfloat/multilingual-e5-small
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- GTE multilingual reranker: https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base
- Jina Embeddings v3: https://huggingface.co/jinaai/jina-embeddings-v3

The selected model's model card instructs that each query include a one-sentence task instruction, while document text is embedded without that instruction. Modrik now applies the query instruction only when the selected model ID is `intfloat/multilingual-e5-large-instruct`; BGE-M3 and other models remain unmodified unless separately configured.

## Hugging Face hosting and actual cost

Hugging Face is the model distribution source, not a promise of free production inference. The current Inference Providers pricing documentation states that Free accounts have no included monthly inference credits; usage requires purchased credits. Therefore, a Hugging Face hosted endpoint is **not** a verified $0 production path for a Free account.

Zero recurring-cost target options:

1. **Local development:** run the official TEI CPU container with the selected model and point `ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT` to its OpenAI-compatible `/v1` origin. TEI supports CPU inference and its OpenAI-compatible `/v1/embeddings` route.
2. **Self-managed compute:** run TEI on a machine already owned and controlled by the project owner. This avoids per-request provider billing but is not free in electricity, availability or maintenance.
3. **Scheduled batch execution:** use a GitHub-hosted runner for bounded worker batches only if database credentials and connectivity are configured. Modrik's repository is public; GitHub documents standard hosted runners as free for public repositories. This is a batch worker, not a continuously available inference API. The model must still be downloaded/loaded during the job, and each run is time-bound.
4. **Hosted model endpoint:** easiest operationally, but paid/usage-based. Do not choose it while the hard constraint is zero cost.

A $0 deployment cannot honestly promise always-on, low-latency inference on a 512 MB web-service instance. Do not load the model into the Next.js web process. Keep inference separate from web requests and run the durable outbox worker in bounded batches.

## Current implementation fit

The repository already contains:
- A provider-neutral embedding model and JSON vector storage that preserve SQLite/PostgreSQL schema parity.
- An OpenAI-compatible embedding adapter.
- A transactional embedding outbox, retry/lease worker, backfill command and content-hash validation.
- Tenant/project/model/dimension filters before vector ranking.
- A bounded exact-cosine semantic search and reciprocal-rank fusion helper.
- A judged retrieval evaluator and benchmark tooling.

The adapter applies the E5 task instruction to query text and leaves document text unchanged. The exact instruction is configurable through `ORGANIZATION_MEMORY_EMBEDDING_QUERY_INSTRUCTION`. Model IDs and dimensions are stored with every vector; changing models requires a fresh backfill and reconciliation before semantic reads can be enabled.

The schema stores vectors as JSON to remain portable. Do not add pgvector or a new vector database merely for feature completeness: the current portable exact-scan path is simpler and preserves both database providers. Revisit pgvector/HNSW only when real corpus size and latency measurements show the bounded exact scan is no longer appropriate. A future pgvector adapter must keep tenant/project authorization inside the database query before top-K selection.

## Activation settings

The example environment now selects:
- `ORGANIZATION_MEMORY_EMBEDDING_MODEL=intfloat/multilingual-e5-large-instruct`
- `ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS=1024`
- `ORGANIZATION_MEMORY_EMBEDDING_QUERY_INSTRUCTION` — the domain-specific retrieval instruction used only for E5 queries.

The following remain intentionally disabled until an endpoint is configured and acceptance gates pass:
- `ORGANIZATION_MEMORY_EMBEDDINGS_ENABLED=false`
- `ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=false`

For TEI, use the official CPU image documented for the current release and serve the selected model through `/v1/embeddings`. Set TEI's `--served-model-name` to `intfloat/multilingual-e5-large-instruct` (the default is the model ID) so the returned model name matches Modrik's model identity check. The endpoint must return the exact configured model ID and a finite 1,024-element vector. Do not point the app at a general chat-completions endpoint.

## Safe rollout sequence

1. Start with local TEI CPU inference using the selected model and run the provider unit tests plus a real smoke test against non-sensitive sample nodes.
2. Enable embedding writes only in a non-production environment; keep semantic reads disabled.
3. Run the resumable backfill for one test organization, then reconcile source hashes, model IDs, dimensions and job states.
4. Verify worker restart, lease expiry, retries, provider timeout, stale content, deletion tombstones and organization/project isolation.
5. Capture Arabic, English and code-switched queries with human-judged relevance labels. Compare BM25 against semantic and hybrid RRF using Recall@K, MRR and NDCG@K; report per-language results and confidence intervals where sample size allows.
6. Keep BM25 as the serving default unless hybrid improves judged quality and passes parity, latency and tenant-isolation gates.
7. Only then enable semantic reads for a small canary organization, with immediate rollback to BM25.

Synthetic fixtures validate code behavior; they are not evidence of retrieval quality. Do not report an accuracy percentage until real human judgments exist.

## Research sources

- Hugging Face model card — E5 Large Instruct: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- Hugging Face supported TEI models: https://huggingface.co/docs/text-embeddings-inference/supported_models
- Hugging Face TEI quick tour/API: https://huggingface.co/docs/text-embeddings-inference/quick_tour
- Hugging Face model card — BGE-M3: https://huggingface.co/BAAI/bge-m3
- Hugging Face model card — multilingual E5 Small: https://huggingface.co/intfloat/multilingual-e5-small
- Hugging Face Inference Providers pricing: https://huggingface.co/docs/inference-providers/main/pricing
- GitHub Actions hosted runner pricing: https://docs.github.com/en/actions/billing-and-usage
