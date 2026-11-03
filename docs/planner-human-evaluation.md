# Planner Human Evaluation & Rater Calibration (H2.2)

## Separation from the three-group user study

This protocol evaluates the Question Planner's four arms on synthetic arbench-v2 outputs. It is separate from the three-group participant study in study-protocol.md. Do not mix benchmark-rater rows with participant NASA-TLX, SUS, or group-level study data.

## Blind packet generation

After the 30 planner-compatible scenarios have completed, generate two independently ordered packets:

    node scripts/create-human-rating-packets.mjs --input bench/results/arbench-v2-planner-runs.jsonl --out bench/results/human-ratings --seed h2-rater-round-1

The default minimum is 10 completed scenarios. The output contains:
- rater-1/packet.csv
- rater-2/packet.csv
- coordinator-only/answer-key.csv
- coordinator-only/manifest.json

Only the coordinator receives the answer key. The rater CSVs do not contain arm names, provider/model, candidate-pool hashes, gold questions, planner metrics, or utility scores. Blind output IDs are stable across both raters but are derived from a private packet seed. Rater order is independently shuffled.

The packet includes only evidence whose fixture consent flag is true. Evidence with consent=false is excluded; the packet generator must never upgrade its consent status. The output questions omit utility metadata so the scoring interface does not reveal the selection arm.

## Rubric

Raters score each question set, not each individual question, from 1 (poor) to 5 (excellent):

| Dimension | What to judge |
|---|---|
| Coverage | Does the set address distinct, important information gaps? |
| Grounding | Are questions anchored in the supplied evidence and project brief? |
| Relevance | Would answers materially change requirements or decisions? |
| Specificity | Are questions clear, answerable and not double-barrelled? |
| Dialect fit | Is Arabic/Egyptian Arabic/code-switching natural for the stakeholder context? |
| Non-redundancy | Does each question add information not already covered? |
| Overall | Global usefulness of the question set for elicitation |
| Confidence | How confident is the rater in their own score? |

For the 2–3 scenario calibration round, generate a separate packet from a separate calibration JSONL file with --min-scenarios 2 and a separate output directory; do not include those calibration scenarios in the final analysis. Raters must work independently and must not discuss scores before submitting both packets. Notes must not contain participant names or contact details. A third RE-literate adjudicator reviews any quality-dimension disagreement greater than one point.

## Agreement and analysis

Import the completed CSVs and the restricted answer key:

    node scripts/analyze-human-ratings.mjs --rater1 bench/results/human-ratings/rater-1/packet.csv --rater2 bench/results/human-ratings/rater-2/packet.csv --key bench/results/human-ratings/coordinator-only/answer-key.csv --out bench/results/human-ratings-analysis

The report computes quadratic weighted Cohen's kappa, exact agreement, within-one agreement, arm-level mean scores, paired impact-aware contrasts, deterministic bootstrap 95% intervals, paired sign-flip permutation p-values, Holm correction, and an adjudication queue. Inferential statistics are withheld unless at least 10 complete scenarios are available. The answer key is used only by the coordinator after ratings are frozen.

## Calibration and reporting rules

1. Run a short calibration round on 2–3 scenarios that are not included in the final analysis.
2. Discuss disagreements, refine rubric interpretation, and freeze the rubric before the main round.
3. Use two independent raters for all final benchmark outputs.
4. Preserve the raw submitted CSVs unchanged; analyze copies and keep the coordinator key access-restricted.
5. Report missing ratings, adjudications, weighted kappa per dimension, and all deviations.
6. Treat the first 30-scenario run as exploratory. Do not make confirmatory superiority claims from LLM-as-judge scores or a small pilot.

The scripts are offline and deterministic; they do not call an LLM or send evidence to a third party. They require no participant data.

## Canonical artifact integrity (hybrid H2.2)

The coordinator-only directory also contains `canonical-packet.json`, the versioned canonical representation of both independently shuffled rater views. The rater CSVs are derived exports, not the source of truth. The manifest records the rubric version and SHA-256 digests of the exact UTF-8 bytes of the canonical packet, each rater CSV, and the answer-key CSV. Analysis requires `--manifest` and verifies all four exact-byte digests before parsing ratings. Any byte-level edit, including whitespace changes, invalidates the artifact set. Keep the canonical packet, manifest, and answer key coordinator-only; distribute only each rater's CSV.

Run analysis with the manifest:

    node scripts/analyze-human-ratings.mjs --rater1 bench/results/human-ratings/rater-1/packet.csv --rater2 bench/results/human-ratings/rater-2/packet.csv --key bench/results/human-ratings/coordinator-only/answer-key.csv --manifest bench/results/human-ratings/coordinator-only/manifest.json
