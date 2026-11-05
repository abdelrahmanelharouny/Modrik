# Requirement change-effort proxy (H3 foundation)

The Debrief requirement constellation now shows an explainable change-effort proxy after reverse impact traversal.

## What it measures

- The selected requirement is the change root.
- The graph's typed reverse traversal supplies directly and transitively affected requirements and their hop depth.
- Each affected requirement contributes a relative effort point weighted by traversal depth and relation type.
- Requirement risk modifiers increase the weight for Must/Should priority, high ambiguity, active drift and open/weak verification.
- The UI reports direct/transitive impact counts, high-risk count, factor frequencies, total relative effort points and a 20–50% planning band widened according to missing input coverage.

## Interpretation and guardrails

This is a deterministic **relative effort heuristic**, not estimated hours, money, schedule or a validated prediction. It does not yet account for team skill, codebase size, architecture boundaries, implementation/test surface, release coordination, or historical change records. The displayed band is a deterministic planning margin widened by missing-input coverage, not a statistical confidence interval. The uncertainty score is an input-completeness indicator, not a probability.

Do not use this score for contractual estimates, staffing commitments, performance evaluation or prioritization without human review. Before operational use, calibrate the weights against a representative set of completed requirement changes, evaluate rank correlation and absolute error by project type, and version the model/weights. Preserve the current inputs and outputs for reproducibility.

## Current validation

The pure estimator has deterministic unit coverage for direct/transitive impact, typed-edge weighting, risk modifiers, duplicate filtering and invalid inputs. CI validates TypeScript, ESLint, production build, PostgreSQL schema validation and stakeholder API/browser E2E. This validates integration/build behavior, not the heuristic's predictive accuracy; empirical calibration against completed engineering changes remains open.

## Reverse traceability depth

Reverse tracker inspection returns impacted requirement details, current status, priority, verification/drift state, traversal depth and typed path, plus unique evidence codes linked to each requirement. This helps reviewers identify affected requirements that are unverified, drifting, or missing evidence before approving a tracker mapping. Missing/deleted requirement details fail closed to nullable metadata; the API does not infer a mapping from text similarity.

## Source-to-requirement provenance

Reverse inspection enriches each direct trace link with a bounded source descriptor: stable evidence code, title, source type, language, consent state, source creation time and the latest immutable revision's version/change note/author/time. Raw evidence content and content hashes are deliberately excluded. Deleted or detached evidence remains visible by its stable trace code with nullable source metadata; the API does not fabricate a replacement source.

## Decision provenance

Human tracker-to-requirement mappings write a structured decision entry in the same database transaction as the mapping and project timestamp update. Reverse inspection returns only decision entries whose parsed structured detail exactly matches both the current tracker mapping ID and resolved requirement ID; legacy free-form notes and other mappings are excluded. The returned trail is metadata-only, not arbitrary journal detail.

## Cost-of-change v2 explainability

The estimator returns a per-requirement decomposition: depth weight, typed-relation weight, base exposure, risk multiplier, risk uplift, final contribution and exact risk/uncertainty reasons. Missing or unknown priority, ambiguity, drift and verification states are surfaced. Graph depths beyond the calibrated weight table and unknown/missing relation provenance are explicitly marked as extrapolated/defaulted. Missing-signal coverage counts each input dimension once; multiple unknown relation labels cannot inflate the uncertainty percentage. The planning band widens deterministically from 20% up to 50% as the share of missing input signals increases.

This is a coverage-sensitive heuristic, not a confidence interval, probability, or validated forecast. Historical calibration and an operator-facing UI remain required before operational use.
