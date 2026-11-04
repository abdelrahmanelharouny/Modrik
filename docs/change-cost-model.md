# Requirement change-effort proxy (H3 foundation)

The Debrief requirement constellation now shows an explainable change-effort proxy after reverse impact traversal.

## What it measures

- The selected requirement is the change root.
- The graph's typed reverse traversal supplies directly and transitively affected requirements and their hop depth.
- Each affected requirement contributes a relative effort point weighted by traversal depth and relation type.
- Requirement risk modifiers increase the weight for Must/Should priority, high ambiguity, active drift and open/weak verification.
- The UI reports direct/transitive impact counts, high-risk count, factor frequencies, total relative effort points and a ±20% planning band.

## Interpretation and guardrails

This is a deterministic **relative effort heuristic**, not estimated hours, money, schedule or a validated prediction. It does not yet account for team skill, codebase size, architecture boundaries, implementation/test surface, release coordination, or historical change records. The displayed band is a planning margin, not a statistical confidence interval.

Do not use this score for contractual estimates, staffing commitments, performance evaluation or prioritization without human review. Before operational use, calibrate the weights against a representative set of completed requirement changes, evaluate rank correlation and absolute error by project type, and version the model/weights. Preserve the current inputs and outputs for reproducibility.

## Current validation

The pure estimator has deterministic unit coverage for direct/transitive impact, typed-edge weighting, risk modifiers, duplicate filtering and invalid inputs. The exact-head CI run #532 passed TypeScript, ESLint, production build, PostgreSQL schema validation and stakeholder API/browser E2E. This validates integration/build behavior, not the heuristic's predictive accuracy; empirical calibration against completed engineering changes remains open.
