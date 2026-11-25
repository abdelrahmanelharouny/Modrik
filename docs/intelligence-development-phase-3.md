# Phase 3 — Intelligence Development

This phase consolidates intelligence work independent of H3 Scale & Resilience.

## 1. Semantic organization memory and hybrid retrieval

The serving contract remains lexical BM25 by default, with optional tenant-filtered exact-cosine embeddings and reciprocal-rank fusion. Semantic reads remain fail-closed behind `ORGANIZATION_MEMORY_SEMANTIC_READ_ENABLED=true`; an HTTP query parameter cannot override a disabled environment gate. Query embeddings are computed before the serializable database transaction. Vector candidates are constrained by verified organization, authorized project IDs, accepted-node status, model and dimensions before ranking. BM25 remains available when the provider is unavailable or embeddings are missing.

The low-cost multilingual candidate is `ibm-granite/granite-embedding-97m-multilingual-r2` (97.4M parameters; 384 dimensions; Apache-2.0; Arabic and English tags). Model metadata is not proof of task quality on Modrik. Configure a persistent HTTPS TEI-compatible endpoint for both document and query embeddings, backfill all active projects, reconcile embedding hashes, verify the worker, and run judged Arabic/English/code-switched retrieval comparisons before switching serving traffic. A temporary CI model container is not a persistent query endpoint.

Compare lexical, semantic and hybrid on the same judged query set. Report Recall@10, MRR, NDCG@10, query coverage, latency p50/p95, provider failure rate and tenant-isolation checks by language. No quality or speed claim is made without actual judged corpus results.

## 2. Question Planner human evaluation

Each complete four-arm experiment can create one blinded question-set packet. The packet contains consented context only, strips rationale/utility/model metadata, and maps the four variants to neutral labels. Two independent authenticated organization members submit 1–5 scores for coverage, grounding, relevance, specificity, dialect fit, non-redundancy, overall usefulness and rater confidence. The arm key is not returned to raters. Only a reviewer with `requirements:approve` can retrieve the aggregate after two complete ratings.

Human results remain descriptive for one experiment; independent scenario repetitions are required for inferential comparisons. Rater calibration exercises must be separate from final packets.

## 3. Agent evaluation and calibration

Calibration uses timestamped human-reviewed Requirement verdicts only. AI verifier outputs are not treated as independent ground truth. Reports include project-wide Brier score/ECE, language/type slices and weekly buckets. Every segment exposes sample count; underpowered segments remain explicitly insufficient-data.

## 4. Egyptian Arabic ASR quality

The transcription endpoint returns conservative QA signals: script ratios, code-switch presence, repeated-token/character warnings and possible Egyptian lexical cues. These are not WER, semantic accuracy or dialect-recognition scores. A cue hit is weak evidence only. Transcripts remain editable and must be reviewed before saving as evidence. Genuine ASR accuracy requires a consented Egyptian Arabic audio set, human reference transcripts, speaker-disjoint splits and WER/CER plus code-switch/dialect slices. Never claim an ASR model improved from script checks alone.

## 5. Continuous drift detection

The hourly scheduled sweep finds recent, explicitly AI-consented EvidenceRevision records that belong to active projects with at least one approved requirement. It enqueues durable idempotent Change Impact jobs. Existing independent workers analyze them against approved requirements and produce only provisional findings. No approval, edit or resolution is automatic. The scheduled workflow needs the repository `DATABASE_URL` secret; the queue consumer/worker and configured LLM provider must also be running for end-to-end processing.

## Rollout and acceptance

- Keep lexical BM25 as the safe retrieval fallback.
- Do not enable indexed or semantic reads until backfill completeness, reconciliation and shadow parity pass for each active organization.
- Complete two independent blind planner ratings and a separate rater-calibration round.
- Gather at least 10 independent planner scenarios before inferential statistics.
- Treat ASR QA scores as triage signals until a consented gold transcript corpus is evaluated.
- Verify the scheduled drift workflow has DB access and that the durable worker drains jobs; review findings manually.

## 6. Configurable Egyptian Arabic ASR and correction capture

The default provider remains the existing ZAI ASR service. A deployment may explicitly switch to `RP_ASR_PROVIDER=openai-compatible` and configure a private OpenAI-compatible `/audio/transcriptions` endpoint, such as a self-hosted Whisper service. The adapter sends WAV, the appropriate `ar`/ `en` language hint, and a verbatim Egyptian Arabic / code-switch prompt; credentials stay server-side and remote endpoints must use HTTPS. Loopback HTTP is development-only and requires explicit opt-in.

The candidate model `openai/whisper-large-v3-turbo` is Arabic-capable according to its Hub language metadata, but that is not evidence of Egyptian dialect accuracy on Modrik's stakeholder audio. Keep the existing human transcript review gate. The optional feedback path captures only original and corrected transcript text after separate user consent; it never accepts or stores audio. Email addresses and Egyptian mobile patterns are redacted, but this is not full anonymization: users must remove names and any other identifiers themselves. Use only content the contributor is authorized to share.

Evaluate any provider/model on a consented, speaker-disjoint Egyptian Arabic corpus with human references. Report WER, CER, code-switch and dialect slices, plus hallucination/omission review. Do not report model accuracy improvements from script-ratio or lexical-cue checks alone.
