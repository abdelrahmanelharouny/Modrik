# Blinded human evaluation (H2.2)

## Why this exists

The LLM judge is an exploratory instrument, not independent ground truth. This workflow creates a blinded review packet so two independent raters can score the same four question sets without seeing which planner arm produced each set.

## Export a packet

First complete planner benchmark runs. Then:

    node scripts/export-human-evaluation.mjs --input bench/results/arbench-v2-planner-runs.jsonl --out bench/results/human-eval-v1 --seed human-eval-v1

This writes:
- \`human-eval-v1.packet.json\`: safe-to-share blinded packet.
- \`human-eval-v1.key.json\`: sensitive mapping from anonymous labels to planner arms.

**Never share the key with raters before both rating files are locked.** Store it separately with restricted access. The packet contains the project brief and only evidence fixtures explicitly marked as consented for AI processing; it does not contain gold labels, arm names, provider/model, prompt versions, or run metrics. A fresh seed creates a new label permutation. The key is bound to the exact packet content by SHA-256.

## Rating rubric

Each anonymous set receives integer scores from 1 (poor) to 5 (excellent) for overall utility, evidence grounding, coverage, clarity, and dialect fit. Redundancy is 1 (low) to 5 (high), so lower is better. Raters should provide a concise rationale and score all four sets independently using the same criteria. Use separate rater IDs; do not discuss scores until both files are finalized.

A rating file has this shape:

    {
      "packetId": "hev_...",
      "raterId": "rater-a",
      "ratings": [{
        "scenarioId": "scenario-id",
        "blindArmId": "scenario-id_A",
        "scores": {
          "overallUtility": 4,
          "evidenceGrounding": 4,
          "coverage": 3,
          "clarity": 5,
          "dialectFit": 4,
          "redundancy": 2
        },
        "rationale": "Brief explanation"
      }]
    }

Each rater should score every blind arm. Missing pairs are reported, never imputed.

## Analyze after both raters finish

    node scripts/analyze-human-evaluation.mjs --packet bench/results/human-eval-v1.packet.json --key bench/results/human-eval-v1.key.json --rater-a bench/results/rater-a.json --rater-b bench/results/rater-b.json --out bench/results/human-eval-report.json

The report includes exact agreement, within-one-point agreement, mean absolute difference, and quadratic weighted Cohen's kappa per rubric dimension. It reveals arm-level descriptive averages only after validating the packet/key checksum and both rating files.

## Interpretation safeguards

- Quadratic weighted kappa measures ordinal inter-rater agreement, not model quality or validity.
- Low agreement means clarify the rubric and adjudicate disagreements before comparing arms.
- The two-rater sample is not a population estimate; report scenario coverage and rater identities separately.
- Do not claim superiority from descriptive means alone. Pair the human results with the prespecified benchmark analysis and disclose missing ratings.
- This process does not replace participant consent, institutional review, or data governance requirements for any future study involving people.
