# Organization Memory — embedding model and zero-cost operating decision

**Selected first deployment model:** `ibm-granite/granite-embedding-97m-multilingual-r2`.

For Modrik, this is a better first $0 deployment choice than the earlier E5 Large Instruct proposal. It has 97M parameters, 384-dimensional vectors, Apache-2.0 licensing, explicit Arabic and English support, retrieval training for programming code, a 32,768-token context window, and a Hugging Face TEI-compatible model card. IBM reports 60.3 on Multilingual MTEB Retrieval and 60.4 on MTEB Code Retrieval. It is designed for latency-sensitive/edge deployment.

Keep lexical BM25 as the authoritative baseline. Semantic retrieval remains disabled until a real, human-judged Arabic/Egyptian Arabic, English and code-switched evaluation proves that hybrid retrieval improves relevance without weakening tenant isolation.

## Why Granite 97M fits Modrik

Modrik knowledge memory stores compact graph nodes (kind, label and description), with queries and evidence in Arabic, English and code-switched language. Modrik also contains technical artifacts, code and integration decisions. Granite 97M is trained for multilingual retrieval and code retrieval, is small enough for CPU inference, and produces compact 384-dimensional vectors.

| Candidate | Strengths | Trade-offs | Decision |
|---|---|---|---|
| `ibm-granite/granite-embedding-97m-multilingual-r2` | 97M parameters; 384 dimensions; Arabic + English + code retrieval; 32K context; Apache-2.0; TEI-compatible; 60.3 Multilingual MTEB Retrieval and 60.4 Code Retrieval in IBM's published results | Newer than E5/BGE; Modrik-specific Egyptian Arabic evaluation still required | **Selected for the first $0 CPU deployment** |
| `ibm-granite/granite-embedding-311m-multilingual-r2` | Higher published multilingual retrieval score (65.2); 768 dimensions; Matryoshka output sizes; 32K context; Apache-2.0 | 311M parameters; more CPU/RAM and 768-d vectors | Quality challenger if the 97M model underperforms |
| `Horizon-Labs/multilingual-embedding-small` | 141M parameters; Arabic included; 1,024 dimensions; distilled from BGE-M3; Transformers.js and TEI tags; good multilingual MIRACL results | 269 MB quantized ONNX file; smaller community evaluation set; not explicitly trained for code retrieval | Strong browser-side challenger |
| `BAAI/bge-m3` | 568M; 1,024 dimensions; dense, sparse and ColBERT-style representations; 100+ languages; 8K context | Larger CPU footprint and Modrik currently stores dense vectors only | Quality benchmark challenger, not first free deployment |
| `intfloat/multilingual-e5-large-instruct` | Strong multilingual model; Arabic/English; 1,024 dimensions; explicit query instruction; TEI compatibility | 560M-class model; 512-token limit; query instruction adds complexity and CPU cost | Retain as a quality challenger, not the $0 default |
| `intfloat/multilingual-e5-small` | 118M parameters; 384 dimensions; Arabic Mr. TyDi MRR@10 reported as 71.5; Transformers.js ONNX export | 512-token limit; query/passage prefixes required; lower published multilingual retrieval score than Granite 97M | Compact alternative if Granite integration fails |
| `Alibaba-NLP/gte-multilingual-reranker-base` | 306M; Apache-2.0; 75 languages including Arabic; 85.03 average on cited Arabic IR reranking leaderboard | Cross-encoder adds latency and a second model; not an embedding model | **Optional future reranker**, only if human-judged results show measurable gain |
| `BAAI/bge-reranker-v2-m3` | Strong multilingual reranker; 87.44 average on cited Arabic IR leaderboard | ~568M parameters and ~2.16 GB full model | Not suitable for first $0 CPU deployment |

## Hugging Face model references

- Granite 97M: https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2
- Granite 311M: https://huggingface.co/ibm-granite/granite-embedding-311m-multilingual-r2
- Granite ONNX / Transformers.js: https://huggingface.co/onnx-community/granite-embedding-97m-multilingual-r2-ONNX
- Horizon multilingual small: https://huggingface.co/Horizon-Labs/multilingual-embedding-small
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- E5 Large Instruct: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- E5 Small: https://huggingface.co/intfloat/multilingual-e5-small
- GTE multilingual reranker: https://huggingface.co/Alibaba-NLP/gte-multilingual-reranker-base
- BGE reranker v2 M3: https://huggingface.co/BAAI/bge-reranker-v2-m3
- Arabic IR leaderboard: https://huggingface.co/spaces/Navid-AI/The-Arabic-IR-Leaderboard
- Granite paper: https://arxiv.org/abs/2605.13521

### Why not select BGE-M3 first?

BGE-M3 is a powerful general-purpose multilingual model. It offers dense, sparse and multi-vector outputs over 100+ languages and long inputs, but it is about 568M parameters and Modrik's current adapter stores dense embeddings only. Its additional output modes would require additional schema, ranking and evaluation work. Granite 97M provides a better quality/CPU/implementation balance for the first $0 release and explicitly includes code retrieval training.

### Why not select E5 Large Instruct first?

E5 Large Instruct is also strong, but its ~560M parameter footprint is unnecessarily expensive for a small CPU VM. Granite 97M is roughly 5.8 times smaller by parameter count, uses 384 dimensions, includes code retrieval training, and does not require query prefixes or task instructions. E5 remains supported by the adapter as a benchmark alternative.

## Hugging Face hosting and actual cost

Hugging Face is the model distribution source, not a promise of free production inference. Hugging Face Inference Providers do not include free monthly inference credits for Free accounts. Therefore, a hosted HF inference endpoint is **not** a verified $0 production path.

Zero recurring-cost options:

1. **Local development:** run the official Hugging Face TEI CPU container with Granite 97M and point `ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT` to its OpenAI-compatible `/v1` origin.
2. **Self-managed compute:** run TEI on the OCI Always Free VM recommended in `docs/free-deployment-decision.md`. The VM has a persistent endpoint for both document and query embeddings.
3. **GitHub Actions:** use the gated worker for bounded outbox batches and backfills only. The model server listens on the temporary runner and disappears at job completion; it is not a live query endpoint.
4. **Hosted inference endpoint:** operationally simple, but usage-based/paid. Do not select it under the strict $0 requirement.

The GitHub Actions worker now uses `ibm-granite/granite-embedding-97m-multilingual-r2` with 384 dimensions. It processes document embedding jobs only. Live semantic search still requires the persistent TEI endpoint on the deployment host; keep `ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=false` until it is configured and evaluated.

## Current implementation fit

The repository already contains:
- A provider-neutral embedding model and JSON vector storage preserving SQLite/PostgreSQL schema parity.
- An OpenAI-compatible embeddings adapter.
- A transactional embedding outbox, retry/lease worker, backfill command and content-hash validation.
- Tenant/project/model/dimension filters before vector ranking.
- A bounded exact-cosine semantic search and reciprocal-rank fusion helper.
- A judged retrieval evaluator and benchmark tooling.

The adapter preserves the model's required input convention. Granite 97M uses the same unprefixed text for queries and documents; the E5 Large Instruct branch remains supported and receives its task instruction on queries only. Model ID and dimensions are stored with every vector. Changing models requires a fresh backfill and reconciliation before semantic reads can be enabled.

The schema stores vectors as JSON to remain portable. Do not add pgvector or a new vector database merely for feature completeness: the current portable exact-scan path is simpler and preserves both database providers. Revisit pgvector/HNSW only when real corpus size and latency measurements show the bounded exact scan is no longer appropriate. A future pgvector adapter must keep tenant/project authorization inside the database query before top-K selection.

## Activation settings

The example environment and gated worker now select:
- `ORGANIZATION_MEMORY_EMBEDDING_MODEL=ibm-granite/granite-embedding-97m-multilingual-r2`
- `ORGANIZATION_MEMORY_EMBEDDING_DIMENSIONS=384`
- `ORGANIZATION_MEMORY_EMBEDDING_ENDPOINT` — private TEI `/v1` endpoint on the deployment host.

The following remain intentionally disabled until endpoint configuration, backfill and acceptance gates pass:
- `ORGANIZATION_MEMORY_EMBEDDINGS_ENABLED=false`
- `ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=false`

For TEI, use the official CPU image documented for the current release and serve the exact selected model through `/v1/embeddings`. Set `--served-model-name` to `ibm-granite/granite-embedding-97m-multilingual-r2` so the returned model identity matches Modrik's strict check. The endpoint must return a finite 384-element vector. Do not point the app at a general chat-completions endpoint.

## Safe rollout sequence

1. Run a real local TEI CPU smoke test against non-sensitive Arabic, English and code-switched examples.
2. Enable embedding writes only in a non-production environment; keep semantic reads disabled.
3. Run the resumable backfill for one test organization, then reconcile source hashes, model IDs, dimensions and job states.
4. Verify worker restart, lease expiry, retries, provider timeout, stale content, deletion tombstones and organization/project isolation.
5. Capture human-judged Arabic/Egyptian Arabic, English and code-switched queries. Compare BM25 against semantic and hybrid RRF using Recall@K, MRR and NDCG@K; report per-language results.
6. Keep BM25 as the serving default unless hybrid improves judged quality and passes parity, latency and tenant-isolation gates.
7. Only then enable semantic reads for a small canary organization, with immediate rollback to BM25.

Synthetic fixtures validate code behavior; they are not evidence of retrieval quality. Do not report an accuracy percentage until real human judgments exist.

## Research sources

- IBM Granite 97M model card: https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2
- IBM Granite paper: https://arxiv.org/abs/2605.13521
- Hugging Face TEI supported models: https://huggingface.co/docs/text-embeddings-inference/supported_models
- Hugging Face TEI quick tour: https://huggingface.co/docs/text-embeddings-inference/quick_tour
- Hugging Face Inference Providers pricing: https://huggingface.co/docs/inference-providers/main/pricing
- GitHub Actions hosted runner pricing: https://docs.github.com/en/actions/billing-and-usage
