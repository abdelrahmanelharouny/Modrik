# Repository Consolidation Audit

**Audit date:** 2026-11-06  
**Repository:** `abdelrahmanelharouny/Modrik`  
**Audited integration head:** `3c4b6631cfda8c491960540d091c7d14d446293c`  
**Scope:** PR dependency chain #27–#47, branch ancestry, duplicate Phase 4 candidate, and exact-head CI evidence.

## Executive result

The canonical integration path is the sequential stack **#27 → #28 → #29 → #30 → #31 → #32 → #33 → #34 → #35 → #36 → #37 → #38 → #39 → #40 → #41 → #42 → #43 → #44 → #45 → #46**.

All twenty PRs in that chain are currently open, Draft, and not merged. Their declared bases form a continuous parent chain; the head SHA of each PR is the base SHA of the next PR. The current #46 head is 283 commits ahead of the reconciled H1.12 base and zero commits behind it. This is a stacked delivery chain, not twenty independent merge candidates.

**Do not merge #47 into the canonical chain.** It is a separate Phase 4 replay based on an older Phase 3 branch, not a missing feature branch that should be appended after #46.

## Canonical PR sequence

| PR | Scope | Base relationship |
|---|---|---|
| #27 | Phase 0 security foundation | `main` |
| #28–#31 | Phase 1 evidence, Phase 2 graph, Phase 3 quality, Phase 4 stakeholder collaboration | Sequentially based on the preceding reconciled PR |
| #32–#44 | H1.1–H1.12 identity, tenant authorization, DB safety, migrations, invitations, recovery, rate limits, production gates, secret rotation, sensitivity | Sequentially based on the preceding reconciled PR |
| #45 | H2.1 reproducible four-arm benchmark | Based on #44 |
| #46 | H2.2 blinded human evaluation and benchmark/retrieval work | Based on #45 |

Every PR #27–#46 was reported by GitHub as `open`, `draft=true`, `merged=false`, and `mergeable=true` at audit time. These are GitHub mergeability observations, not approval to merge and not proof that the whole stack has been merged to `main`.

## Separate Phase 4 candidate (#47)

PR #47 (`codex/modrik-phase-4-reconciled`) is based on `codex/modrik-phase-3-reconciled`, whereas canonical PR #31 is based on `codex/modrik-phase-3-full-stack-reconciled`. It is therefore outside the canonical ancestry.

Patch comparison of #31 and #47 found:
- 15 overlapping paths in #47; #31 has those same 15 paths plus `proxy.ts`.
- 10 overlapping files have byte-identical patch text.
- 5 overlapping files carry different patch text: stakeholder route, request-origin security helper, proxy, security tests, and stakeholder API auth integration tests.
- #47's exact-head workflow run `41692546928` failed its stakeholder API/browser E2E step; its PostgreSQL schema job passed.
- The canonical Phase 4 candidate is already included in the #27–#46 chain, and the current #46 head has a successful full CI run.

**Disposition:** keep #47 out of the merge sequence. It should be closed or archived only after an explicit maintainer decision; this audit does not close it or modify its Draft status. Its five differing patches should be treated as historical divergence, not silently cherry-picked.

## Exact-head verification

Canonical current head:
- SHA: `3c4b6631cfda8c491960540d091c7d14d446293c`
- CI run: [42153766097](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42153766097)
- Result: **completed / success**

Verified successful jobs and gates include:
- Regression tests, benchmark corpus validation, production release configuration shape.
- SQLite schema validation, organization-memory repair/reconciliation integration.
- TypeScript, lint, production build.
- Stakeholder API and browser E2E integration.
- PostgreSQL schema parity, Prisma validation/client generation, PostgreSQL schema push.
- PostgreSQL organization-memory isolation/governance integration.
- PostgreSQL organization-memory retrieval benchmark and artifact upload.

This is evidence for the exact #46 head only. It does not mean any PR has been merged to `main`, nor does it replace staging/production verification.

## Safe integration procedure

1. Preserve the canonical dependency order #27 through #46.
2. Before merging any stack segment, rerun CI on the exact head and review the complete diff against its target base.
3. Merge from the bottom of the stack upward, updating/rebasing downstream PR bases as each parent lands; do not merge a child before its parent.
4. Keep #47 excluded unless a future code-level review identifies a concrete unique fix worth porting, with fresh tests on the canonical head.
5. After the stack lands, run release gates against `main`: production migration rehearsal, backup/restore, live Redis/email/provider connectivity, deployed security checks, and staging smoke/E2E.
6. Production deployment and irreversible migrations require explicit release authorization.

## Audit boundaries

This is a GitHub metadata, ancestry, patch-overlap, and CI audit. No PR was merged, closed, retargeted, or changed from Draft. No production migration or deployment was run. A successful GitHub workflow is not a substitute for live external-service credentials or real participant research.
