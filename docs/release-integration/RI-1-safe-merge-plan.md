# RI.1 — Safe Merge Preparation

**Status:** preparation only; no product PR has been merged by this work.
**Baseline inspected:** `main` at `7ce3ea6d15e9ccbf468b985a0bbcb4547177a453`.
**Scope:** open PRs #1–#21 in this repository as inspected on 2026-11-03.

## Executive decision

Do not bulk-merge the open stack. The PRs are deliberately stacked and several branch heads have moved away from the exact base SHAs recorded by their PRs. First reconcile the stack against the current `main`, then merge in dependency order with CI rerun after each integration boundary.

## Verified repository topology

The open PR chain is:

1. #1 Phase 0 — base `main`, head `codex/modrik-hardening-phase-0`.
2. #2 Phase 1 — base #1 head.
3. #3 Phase 2 — base #2 head.
4. #4 Phase 3 — base #3 head.
5. #5 Phase 4 — base #4 head.
6. #6 H1 production foundation — base #5 head.
7. #7 H1.2 identity foundation — base #6 head.
8. #8 H1.3 identity sessions/RBAC — base #7 head.
9. #9 H1.4 authorization/release gates — base #8 head.
10. #10 H1.5 database safety — base #9 head.
11. #11 H1.6 schema inventory/migration gate — base #10 head.
12. #12 H1.7 invitations/membership lifecycle — base #11 head.
13. #13 H1.8 password recovery/session revocation — base #12 head.
14. #14 H1.9 distributed rate limiting — base #13 head.
15. #15 H1.10 release configuration — base #14 head.
16. #16 H1 documentation reconciliation — base #15 head.
17. #17 H1.11 integration credential rotation — base #16 head.
18. #19 H1.12 paired planner sensitivity — intended after #17.
19. #18 H2.1 four-arm benchmark — base #19 head.
20. H2.2 is represented by two competing PRs (#20 and #21), both based on #18.

This is a dependency order, not an assertion that every current head is still a clean descendant of its declared base.

## Blocking findings

### 1. Stale integration base

Current `main` is `7ce3ea6d15e9ccbf468b985a0bbcb4547177a453`. Comparing current `main` to the Phase 0 head reports a diverged history: the Phase 0 branch is 227 commits ahead and current `main` is 2 commits ahead. The PR #1 base SHA recorded by GitHub is `09831a19f6f2cb28d7a225c5d68a3ec0980a9042`, not current `main`.

Therefore, even the first PR must be reconciled with the two current-main commits before integration. Do not force-push or rewrite the existing stack blindly.

### 2. H1.12 parent drift

PR #19 records base SHA `f6ec45060b8c0cb9e11829f6834da90f160be304`. The current H1.11 branch head is `1a13291f838e5f4c30859c660d602ba05da1e539`. A compare of the current H1.11 branch with H1.12 reports divergence (H1.12 is 9 commits ahead and 3 behind), so the intended parent relationship needs reconciliation before #19 is considered stack-safe.

### 3. Duplicate H2.2 implementations

- PR #20 (`codex/modrik-h2-2-human-evaluation-calibration`) is one commit ahead of H2.1 and adds six files, including `src/lib/research/human-ratings.mjs`, CSV-oriented packet/rating workflows, analysis and tests.
- PR #21 (`codex/modrik-h2-2-human-evaluation`) is four commits ahead of H2.1 and also changes six files, with a separate JSON-oriented workflow and its own docs/scripts/tests.

They are distinct implementations of the same H2.2 scope, not two sequential stack layers. Keep #20 as the provisional canonical base because it contains the dedicated reusable research module and fuller statistical workflow. Before closing or superseding #21, perform a line-level feature comparison and port any unique packet-integrity protections (including exact-packet binding/checksum and strict key/rater validation) into the canonical branch, then rerun the complete H2.2 test suite. Do not merge both.

## Required integration procedure

### Gate A — freeze and inventory
- Record the exact current SHA of every PR head and declared base.
- Re-fetch PR metadata immediately before each operation; do not rely on this report as a live lock.
- Preserve all existing branches until final verification.

### Gate B — reconcile the stack
- Create a new integration branch from current `main`.
- Rebase/cherry-pick or reconstruct Phase 0 onto that branch without dropping the two current-main commits.
- For each subsequent PR, verify its diff against the newly integrated parent, not merely its historical PR base.
- Resolve H1.12 parent drift explicitly.
- Consolidate H2.2 into one branch; do not cherry-pick whole competing implementations without a file/behavior-level review.

### Gate C — sequential integration
Integrate in this order, stopping on the first failure:
`#1 → #2 → #3 → #4 → #5 → #6 → #7 → #8 → #9 → #10 → #11 → #12 → #13 → #14 → #15 → #16 → #17 → #19 → #18 → canonical H2.2`.

After each logical boundary:
- run the repository CI and relevant focused tests;
- verify SQLite and PostgreSQL schema/migration parity where applicable;
- inspect generated migration SQL and data-loss behavior;
- check auth/tenant isolation, session revocation, rate limiting, and secret-rotation regressions;
- record the tested SHA and results before proceeding.

### Gate D — release readiness
- Verify branch protection and required checks through an authorized repository-admin connection. The current GitHub integration could not read the branch-protection endpoint (HTTP 403), so its state must be confirmed by an administrator.
- Require CI on the exact merge candidate SHA; branch-level historical green checks are not sufficient.
- Perform a clean install/build, unit/integration tests, and production-like PostgreSQL validation.
- Keep real external-service verification (Redis, email delivery, OAuth providers, production secrets) explicitly separate from mocked tests.
- Do not claim pilot readiness until recruitment, consent, operational runbook, and human-evaluation data collection are complete.

## Evidence snapshot

- 21 open PRs were returned by GitHub; all were Draft at inspection.
- Prior CI audit in this workstream found successful checks on the inspected PR SHAs. Those historical results must be rerun after stack reconciliation.
- No PR was merged as part of RI.1 preparation.
- Branch-protection read was denied to this integration with HTTP 403; no protection setting was changed.
- Compare results: H2.1 is a direct one-commit descendant of H1.12; both H2.2 branches are direct descendants of H2.1 but diverge from one another.
- Current `main` has two commits not present in the Phase 0 branch according to GitHub compare.

## Exit criteria for RI.1

- [ ] A reconciled integration branch exists from current `main`.
- [ ] Every stacked PR is mapped to a verified parent SHA.
- [ ] H1.12 is reconciled with current H1.11.
- [ ] H2.2 is consolidated into one tested implementation.
- [ ] Main protection and required checks are confirmed by an authorized admin.
- [ ] A sequential merge plan is approved by fresh CI on each candidate SHA.

Until these are true, RI.1 remains **blocked / in preparation**, and bulk merge is unsafe.
