# arbench-v2 Planner Ablation (H2.1)

The full corpus has 120 scenarios. The four-arm Question Planner applies to 30 question_utility_json fixtures: 15 elicitation and 15 dialect_ar_eg, six per domain across five domains, 10 hard and 20 medium. The other 90 fixtures target other pipeline stages and are not counted as planner runs.

Each scenario creates an isolated temporary ELICITATION project with synthetic evidence while preserving each fixture’s explicit consent flag; non-consented evidence is excluded from model prompts by the platform data-safety filter. Four arms are run: single_shot (direct five-question baseline), random (seeded selection from the shared candidate pool), llm (LLM selection from that pool), and impact_aware (utility selection under the ask-cost budget). The three pool-based arms must share one candidate-pool SHA-256. Every run stores seed, prompt version, provider/model label, metrics, latency, estimated tokens, generated questions and gold labels. No participant data is used.

Validate fixtures without model calls:

    bun run bench:planner:validate

Run a smoke sample (requires a configured LLM provider and database):

    bun run bench:planner:run -- --limit 2 --seed h2-smoke-v1

Run all 30 planner-compatible scenarios serially:

    bun run bench:planner:run -- --seed h2-full-v1 --delay-ms 1000

Run selected scenarios or choose another output file:

    bun run bench:planner:run -- --ids arb2-elicitation-clinic-v1,arb2-dialect_ar_eg-clinic-v1 --out bench/results/clinic-rerun.jsonl

The runner resumes completed scenario/seed pairs, locks the output file against concurrent writers, appends one JSONL record per scenario, and deletes each temporary project after recording its result. Use a new output file for a distinct replicate; keep one seed per scenario in an analysis file to avoid treating repeated runs as independent observations. Failed scenarios are recorded with sanitized error text.

Analyze completed runs:

    bun run bench:planner:analyze -- --input bench/results/arbench-v2-planner-runs.jsonl

The analyzer reports arm means/medians and paired impact-aware contrasts against each baseline. Positive differences favour impact-aware; lower-is-better metrics (redundancy, tokens, latency) are reverse-coded. It computes deterministic percentile bootstrap 95% intervals, two-sided paired sign-flip permutation p-values, Holm correction across the three arm contrasts within each metric, and rank-biserial effect sizes. Inferential statistics are withheld unless at least 10 paired scenarios are available; smaller samples show descriptive differences only.

Limitations: the LLM judge is blinded to arm identity but is not an independent human rater. Its scores are exploratory until calibrated against two blind human raters. Gold questions and utility labels are retained, but this report does not claim exact semantic recall. Run all 30 fixtures before making planner-wide claims; a two-scenario smoke run validates plumbing only. CI validates fixture integrity and deterministic analysis, not paid/provider-backed inference.
