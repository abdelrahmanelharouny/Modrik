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

### 2. Phase 3 parent drift

PR #4 compares as diverged from its declared Phase 2 base: its head is 14 commits ahead and 1 commit behind. This is a smaller but real stack drift. Inspect the unique base-side commit and reconcile it into the Phase 3 integration candidate before treating #4 as a clean child of #3.

### 3. H1.12 parent drift

PR #19 records base SHA `f6ec45060b8c0cb9e11829f6834da90f160be304`. The current H1.11 branch head is `1a13291f838e5f4c30859c660d602ba05da1e539`. A compare of the current H1.11 branch with H1.12 reports divergence (H1.12 is 9 commits ahead and 3 behind), so the intended parent relationship needs reconciliation before #19 is considered stack-safe.

### 4. Duplicate H2.2 implementations

- PR #20 (`codex/modrik-h2-2-human-evaluation-calibration`) is one commit ahead of H2.1 and adds six files, including `src/lib/research/human-ratings.mjs`, CSV-oriented packet/rating workflows, analysis and tests.
- PR #21 (`codex/modrik-h2-2-human-evaluation`) is four commits ahead of H2.1 and also changes six files, with a separate JSON-oriented workflow and its own docs/scripts/tests.

They are distinct implementations of the same H2.2 scope, not two sequential stack layers. Keep #20 as the provisional canonical base because it contains the dedicated reusable research module and fuller statistical workflow. Before closing or superseding #21, perform a line-level feature comparison and port any unique packet-integrity protections (including exact-packet binding/checksum and strict key/rater validation) into the canonical branch, then rerun the complete H2.2 test suite. Do not merge both.

## Required integration procedure

### Gate A — freeze and inventory
- Record the exact current SHA of every PR head and declared base.
- Re-fetch PR metadata immediately before each operation; do not rely on this report as a live lock.
- Preserve all existing branches until final verification.

### Gate B — reconcile the stack
- Reconcile the Phase 3 base-side commit in #4.
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
- [ ] Phase 3 (#4) is reconciled with Phase 2.
- [ ] H1.12 is reconciled with current H1.11.
- [ ] H2.2 is consolidated into one tested implementation.
- [ ] Main protection and required checks are confirmed by an authorized admin.
- [ ] A sequential merge plan is approved by fresh CI on each candidate SHA.

Until these are true, RI.1 remains **blocked / in preparation**, and bulk merge is unsafe.


## RI.2 — Detailed reconciliation findings (2026-11-03)

This section records file-level evidence from both sides of each divergent comparison. It is a reconciliation specification; no source branch has been rewritten.

### PR #1 — preserve current-main knowledge-graph validation

Reverse comparison (Phase 0 head → current `main`) identifies two current-main-only files:

- `src/lib/knowledge-graph/validation.mjs` — 52 lines, typed node/edge normalization and validation helpers.
- `tests/knowledge-graph.test.mjs` — 29 lines of validation coverage.

The Phase 0 branch does not contain these files. They are not incidental metadata: later graph work depends on this module and tests. The integration candidate must retain both files and verify their imports/API contract against the Phase 0 implementation. Do not resolve this divergence by choosing the Phase 0 tree wholesale.

### PR #4 — preserve Phase 2 declaration contract

Reverse comparison (Phase 3 head → Phase 2 head) identifies:

- `src/lib/knowledge-graph/validation.d.mts` — 26-line declaration file present on Phase 2 and absent from Phase 3.

The Phase 3 PR changes `prisma/schema.prisma`, adds the quality route, panel, quality module and tests. The missing declaration file is a separate graph API contract and should be carried forward unless the integrated implementation intentionally replaces it with an equivalent declaration. Validate TypeScript/NodeNext resolution after reconciliation.

### PR #19 — retain the stricter H1.12 secret-rotation guard

The H1.12 version of `scripts/rotate-integration-secrets.mjs` adds an explicit fail-closed branch: if decryption fails because the encrypted token uses an unsupported version, it rethrows rather than attempting the destination-key fallback. The H1.11 version attempts that fallback for all decryption failures. Keep the H1.12 guard.

The rotation test file is present in both inspected branch tips with the same blob SHA, despite the compare summary reporting a small test-file delta relative to the PR's recorded base SHA. Re-fetch and compare against the exact PR base commit before deciding whether any test hunk needs to be replayed. The H1.12 branch also adds the planner experiment analysis module/test and study-protocol updates; retain those changes.

### H2.2 — hybrid consolidation contract

PR #20 and #21 overlap in `package.json` and both implement packet export plus analysis, but their interfaces and evidence safeguards differ.

Keep from #20:
- reusable `src/lib/research/human-ratings.mjs` module;
- CSV packet workflow and analysis;
- ordinal weighted kappa, exact/within-one agreement, paired impact-aware contrasts, bootstrap intervals, permutation tests, Holm correction, and adjudication queue;
- explicit minimum-scenario inferential gate and separation from the participant study.

Port from #21:
- SHA-256 binding of the coordinator key to the exact blind packet;
- strict refusal on packet/key mismatch and output overwrite;
- stronger rater identity / rating-file validation and JSON import path where it materially improves auditability.

Do not copy both PRs' `package.json` scripts as-is: reconcile names into one documented command interface. Keep one rubric schema and one canonical packet format; avoid parallel CSV and JSON formats unless a tested conversion boundary is deliberately provided. Add tests for tampered packet, mismatched key, duplicate rater IDs, missing/duplicate scenario-arm pairs, malformed scores, consent filtering, deterministic packet generation, and no-overwrite behavior. Run all H2.2 tests against the merged H2.1 output contract.

### Current implementation capability boundary

The available GitHub integration supports branch creation, file edits, compare, and PR metadata operations, but does not expose a safe cherry-pick/rebase operation. A correct multi-file reconciliation requires applying and testing patches against a local checkout or an equivalent Git-aware workflow. Therefore this pass records exact reconciliation hunks and acceptance tests; it does not fabricate a rebased source branch from partial file edits.

## RI.2 status

- [x] Identify exact current-main-only files missing from Phase 0.
- [x] Identify exact Phase 2 declaration missing from Phase 3.
- [x] Inspect H1.11/H1.12 secret-rotation implementation difference.
- [x] Compare H2.2 file sets and workflow overlap.
- [ ] Reconstruct and test the reconciled stack in a Git-aware checkout.
- [ ] Rerun full CI on each reconciled candidate SHA.
- [ ] Obtain authorized branch-protection verification.


## RI.3 — H2.2 canonicalization review (2026-11-03)

### Fresh immutable-head verification

| PR | Base SHA | Head SHA | Delta | Latest PR CI |
|---|---|---|---:|---|
| #20 | `2d7c2a2f4a9500062e8803fbce924e9ef95fba65` | `27e60abca8d40cf8754eddeeb43aac428a2464b0` | 1 commit / 6 files | run #314 — completed, success |
| #21 | `2d7c2a2f4a9500062e8803fbce924e9ef95fba65` | `063485e07278fd94e7c0564e6619213bbb0da887` | 4 commits / 6 files | run #313 — completed, success |

Both are direct children of the same H2.1 SHA and neither is a child of the other. Both remain open, Draft, and unmerged. Their green runs validate their own isolated heads only; they do not validate a hybrid candidate.

### Line-level implementation review

**Keep the reusable/statistical core from #20**
- Preserve `src/lib/research/human-ratings.mjs` as the shared module boundary.
- Keep quadratic weighted Cohen's kappa, exact and within-one agreement, paired arm comparisons, deterministic bootstrap intervals, sign-flip permutation, Holm correction, effect-size reporting, and adjudication queue.
- Preserve the inferential minimum-scenario gate and do not treat confidence as a quality dimension.
- Keep CSV parsing/serialization as an interchange adapter, not as a second domain model.

**Port and harden the integrity model from #21**
- Keep SHA-256 binding between the blinded packet and coordinator-only mapping.
- Keep rejection of packet/key mismatch, unknown blind IDs, invalid arm mappings, duplicate rater identities, malformed ordinal values, and unknown rating IDs.
- Keep no-overwrite semantics.
- Use one canonical versioned JSON packet; derive rater CSV exports from it. This avoids two competing canonical schemas while retaining spreadsheet-friendly scoring.

**Newly identified hardening details**
1. #20 checks whether the output key exists, then writes without exclusive-create semantics. A check-then-write race can overwrite an artifact created between those operations. The canonical writer must use exclusive creation (`wx`) for every packet/key/manifest file and clean partial output on failure.
2. #21 hashes `JSON.stringify(packet, null, 2) + "\\n"` after parsing the packet file. This checks canonical serialization of the parsed object, not original on-disk bytes. Either hash exact bytes read from disk or explicitly define and test canonical serialization; do not claim raw-file integrity while normalizing first.
3. Preserve missing-pair reporting without imputation, but expose expected, submitted, matched, missing, duplicate, and unknown counts per rater/scenario.
4. Write packet and key into a fresh output directory using exclusive creation; remove partial artifacts on failure and never silently replace a prior key or packet.
5. Test blinding across the entire serialized packet and filenames: no arm IDs, gold labels, provider/model, prompt metadata, candidate-pool hashes, utility scores, or answer-key fields may leak.
6. Consent is a strict boolean filter. Tests must prove false, missing, null, and non-boolean values are excluded; never coerce them to true.
7. Keep this offline benchmark artifact separate from participant NASA-TLX/SUS records. Do not imply recruitment, ethics approval, or actual human ratings before they exist.

### Canonical H2.2 contract

- One versioned JSON packet containing scenario metadata, consent-filtered evidence, blinded arms, rubric version, seed fingerprint, and packet ID.
- One coordinator-only mapping key cryptographically bound to the exact packet bytes; never included in rater exports.
- Two independently randomized rater exports derived from the immutable packet. CSV is an exchange format; imported rows must map to immutable packet IDs.
- One analysis module: #20 statistical functions plus #21 integrity/validation boundary.
- One CLI surface with explicit export, validate, and analyze commands; avoid duplicate command aliases unless each is documented and tested.
- Distinct rater identities; integer scores 1–5; duplicate keys and unknown scenario/arm pairs are hard errors.
- Missing ratings are reported, never imputed. Inferential contrasts are withheld below 10 complete scenarios.
- Report ordinal agreement separately from arm performance. Kappa is agreement, not validity; results remain exploratory until independent raters complete the protocol.

### RI.3 acceptance-test matrix

| Area | Required test | Pass condition |
|---|---|---|
| Export determinism | Same fixtures and seed | Same packet body, blind IDs, key mapping, and hash |
| Consent | true / false / missing / null / string / number | Only strict boolean true evidence exported |
| Blindness | Scan all packet/CSV fields and filenames | No arm, gold, model/provider, prompt, pool-hash, utility, or key leakage |
| Key integrity | Change one packet byte | Exact-byte checksum mismatch rejected |
| Key structure | Missing, duplicate, unknown, wrong-arm mapping | Hard failure before arm reveal |
| Rater identity | Same ID for both raters | Hard failure |
| Rater schema | Missing, noninteger, out-of-range, duplicate, unknown IDs | Invalid data rejected without coercion |
| Pair completeness | Missing ratings | Counts reported; no fabricated score/agreement |
| No overwrite | Existing output or concurrent creation | Exclusive create fails without replacing files |
| Partial write | Simulated mid-export failure | Partial artifacts cleaned; no valid-looking manifest remains |
| Agreement | Perfect / adjacent / reversed synthetic scores | Exact, within-one, MAE, weighted kappa match hand calculations |
| Inference gate | 9 vs 10 complete scenarios | 9: no inferential claims; 10: deterministic CI/permutation/Holm |
| Statistics | Fixed seeded synthetic differences | Reproducible bootstrap, permutation, Holm, effect sizes |
| CLI | Missing args, invalid input, success | Stable errors and documented outputs |
| Study separation | Participant-study fixtures/paths | No cross-ingestion or shared output namespace |
| Regression | Full H2.1 + H2.2 suite | All benchmark/security tests remain green |

### Build/verification status

- [x] Both source PRs and exact heads re-fetched.
- [x] Both PR-specific CI runs confirmed completed/success on the exact heads.
- [x] Changed-file overlap and both patches reviewed.
- [x] Concrete output race and checksum-byte-semantics gaps identified.
- [ ] Canonical hybrid implementation created.
- [ ] Focused tests run on the hybrid implementation.
- [ ] Full repository CI run on the hybrid candidate SHA.
- [ ] Canonical PR opened and reviewed before superseding either source PR.

### Tooling / execution boundary

The GitHub connection exposes Git object primitives (blob/tree/commit/ref) in addition to file and PR APIs. However, the current execution environment cannot resolve `github.com` for a local clone, and no local working tree is available to run Bun/Node/Prisma/Playwright tests. A tree/commit assembled from remote patches without executing the repository test suite would be an unverified source rewrite, not a validated canonical build. Therefore no product branch was fabricated and neither source PR was modified or closed in this pass.

**RI.3 remains in implementation/verification, not complete.** The next safe step is a Git-aware build environment with the repository checkout, implementation of this contract, focused and full CI, and only then opening the canonical H2.2 PR.


### RI.3.1 — Deeper data-leakage and statistical audit

A second pass over the complete #20 module/tests and #21 exporter/analyzer found additional items that must be part of the canonical build:

1. **#20 rater-content leakage:** `buildBlindPackets` serializes each question's `rationale`, `priority`, `askCost`, and `fallbackAssumption` into `questions_json`. Priority/ask-cost/fallback fields can expose the planner's internal selection/utility logic; rationale may expose arm-specific generation traces. The #20 test only checks that a field literally named `utility` is absent, which is insufficient. Canonical rater payload should contain only question text and safe language metadata unless the rubric explicitly requires another field. Add recursive denylist tests for internal score/cost/priority/rationale/arm/provider/prompt fields.
2. **#20 answer-key binding:** the CSV answer key has no cryptographic binding to the exact two rater packet exports. A packet/key mix-up can therefore map blind IDs to the wrong arms if identifiers collide or artifacts are copied between runs. The canonical manifest must bind packet ID, rubric version, exact packet bytes, both rater export hashes, and key hash; analysis must verify all bindings before revealing arms.
3. **#21 byte-integrity implementation:** the CLI reads raw `packetText`, parses it, then calls `analyzeHumanEvaluation(packet, ...)`; the analyzer reserializes the object before hashing. Change the function contract to accept the raw packet bytes (or a verified hash computed at the file boundary) and compare those bytes to the key. Add a whitespace-only packet mutation test to prove the distinction.
4. **#21 rating completeness:** it correctly permits missing pairs and reports unpaired counts, but it does not return per-scenario/per-rater completion diagnostics. Add expected/submitted/matched/missing counts and explicit duplicate/unknown rejection details; never silently drop a malformed rating.
5. **Weighted kappa degeneracy:** both implementations return kappa=1 when expected disagreement is zero. This conflates perfect agreement with a degenerate marginal distribution where kappa is mathematically undefined. Return a documented null/undefined kappa for the zero-expected-disagreement case while still reporting exact and within-one agreement; add constant-score tests for same and different rater marginals.
6. **Rubric alignment:** #20's rubric has eight fields (seven quality dimensions plus confidence), while #21 has six dimensions with opposite redundancy direction (higher is worse). Select one rubric version before collecting ratings. Prefer a single explicit polarity (e.g. non-redundancy: higher is better) and document score anchors, or retain redundancy with a clearly reversed interpretation and transform it before arm contrasts. Never pool ratings from incompatible rubric versions.
7. **Small-sample interpretation:** bootstrap/permutation/Holm outputs are exploratory. The 10-scenario threshold is a minimum computational/reporting gate, not a power analysis or guarantee of adequate inference. Report scenario count, rater count, missingness, and uncertainty; do not describe the threshold as statistical sufficiency.

These are review findings and required changes, not claims that the existing PRs already implement them. Add the new cases to the acceptance matrix before any canonical H2.2 branch is approved.


### RI.3.2 — Cross-stack API and benchmark-boundary audit

A targeted reread of PR #4 (Requirement Quality Intelligence), #18 (H2.1 benchmark), and #19 (H1.12) adds these integration gates:

**Requirement Quality API (PR #4)**
- The introduced `GET /api/projects/[id]/quality` and `POST /api/projects/[id]/quality` handlers look up a project by ID and then read/write assessments. The PR predates the H1 tenant membership stack, so its original owner-session gate is not sufficient evidence of organization-scoped authorization.
- During integration, both handlers must use the same project-scoped authorization helper as the other project APIs and derive the organization boundary from the authenticated membership, not from request body fields.
- Add cross-tenant tests: an authenticated member of organization A cannot read, create, accept, reject, or enumerate assessments for a project belonging to organization B. Include direct API calls, not only hidden UI controls.
- Assessment writes must be blocked during `agent_running` / `approving` states as designed, but the final handler must also validate requirement ownership within the authorized project and reject forged requirement IDs.
- Preserve the source snapshot/hash staleness behavior and ensure the declaration file `src/lib/knowledge-graph/validation.d.mts` from Phase 2 is not lost while reconciling Phase 3.

**H2.1 benchmark boundary (PR #18)**
- The benchmark run records intentionally retain `provider/model`, `goldQuestions`, candidate-pool hashes, candidate metadata, and per-arm metrics for offline analysis. These are coordinator-side research artifacts, not rater-facing fields.
- H2.2 export must use an explicit allowlist of rater-visible fields. A denylist alone is insufficient because new fields can be added to benchmark records later.
- Keep benchmark outputs outside version control (`/bench/results/`) and ensure no real participant or private project evidence is included in the H2.1 synthetic fixture run.
- Treat the 30 planner-compatible fixtures as the planner ablation subset, not as evidence that all 120 corpus scenarios ran through the planner.
- The H2.1 runner requires a configured model provider and database; fixture validation and analysis unit tests do not prove a live 30-scenario run occurred. Record actual successful/failed scenario counts and provider configuration separately from code/CI status.

**H1.12 secret rotation (PR #19)**
- Preserve the fail-closed unsupported-version check before any fallback decryption attempt.
- Keep the corrected newline output and test ordering; verify the dry-run and apply paths against encrypted fixtures with old key, new key, corrupt ciphertext, and unsupported future version.
- Rotation must be backed up, idempotent, and explicitly opt-in with `--apply`; do not automatically rotate during app startup or deployment.

**Additional RI.3 acceptance gates**
| Area | Required test | Pass condition |
|---|---|---|
| Project authorization | Org A calls quality endpoints for Org B project | 404/403 with no data disclosure or mutation |
| Requirement ownership | Valid project ID + requirement ID from another project | Rejected; no assessment created |
| Assessment lifecycle | Create/read/accept/reject during stage transitions | Only authorized and valid transitions succeed |
| H2.2 export allowlist | Add unknown sensitive fields to benchmark fixture | They are absent from rater export by construction |
| Benchmark provenance | Synthetic fixture run vs participant data | Rater packet provenance is synthetic/offline; no participant records |
| Benchmark scope | 30 planner subset vs 120 total corpus | Reports state exact denominator and completed run count |
| Secret rotation | Old/new/wrong key, corrupt v1, unsupported v2 | Deterministic safe behavior; no unsupported-version fallback |


### RI.3.3 — Requirement Quality API authorization regression coverage (2026-11-03)

A focused E2E regression suite was added to the H1.4 release-gates branch (codex/modrik-h1-4-release-gates) in commit 9d5975470180ec5a35144c0fa34905f836d27ef1, modifying only tests/stakeholder-api-auth.integration.mjs.

Coverage added:
- same-tenant member can create, read, and accept a current Requirement Quality assessment;
- cross-tenant GET and POST are hidden with HTTP 404;
- forged x-modrik-organization-id and x-modrik-role headers do not change the identity session's tenant boundary;
- an authenticated tenant-A user cannot submit a tenant-B requirement ID against a tenant-A project;
- viewer can read assessments but cannot create or accept them (HTTP 403).

The existing H1.4 proxy maps project quality routes to projects:read, requirements:write, and requirements:review by HTTP method, and checks the project organization against the authenticated identity session. This addition exercises that behavior over HTTP rather than relying only on static route-policy inspection.

Verification is pending: the exact commit currently has no associated PR workflow runs and no combined status checks. The CI workflow defines the stakeholder API/browser E2E integration job, but no test pass is claimed. The new test cases must execute on the exact candidate SHA before this gate can close.

| Gate | State |
|---|---|
| E2E test code committed | Complete |
| Exact-head CI execution | Pending (no run returned) |
| Test assertions pass | Not verified |
| H1.4 integration gate | Open |

This is a test-only change on the H1.4 branch; it does not merge PR #9 or resolve the broader stacked-branch reconciliation.


### RI.4 — H2.2 statistical branch hardening (2026-11-03)

Concrete code changes were committed to PR #20's statistical implementation branch (codex/modrik-h2-2-human-evaluation-calibration):
- blind question exports now use a strict allowlist of question text and language; rationale, priority, askCost, and fallbackAssumption are excluded from rater-visible payloads;
- quadratic weighted kappa returns null when expected disagreement is zero, avoiding a misleading perfect-agreement result in a degenerate distribution; exact and within-one agreement remain separately reported;
- packet files are written exclusively with wx semantics, and partial artifacts from a failed multi-file creation are cleaned up without overwriting pre-existing files;
- regression assertions cover all four removed fields and the degenerate kappa case.

Commits: 90736cfcc428e8f1d7d50c6d6d7f81b6b2639c70, 70f2f21716fbd7d2c9d1d515b8da8d92799a0aa4, c51b9cf9ffd57203b2f8588744bc4ddff28644b5.

| Gate | State |
|---|---|
| Source/test changes committed | Complete |
| Latest-head Actions run | Not returned yet |
| H2.2 statistical tests verified | Pending CI |
| H2.2 canonical hybrid with packet integrity from PR #21 | Not implemented |
| Human recruitment / actual ratings | Not started / no claims |

The change set remains on PR #20's branch. PR #20 and PR #21 are still competing implementations on the same H2.1 base; neither is merged. The intended final implementation remains a single canonical H2.2 workflow combining PR #20's statistical engine with PR #21's packet/key integrity and strict validation. No participant data or real human evaluation is implied by synthetic unit tests.


### RI.4.1 — H2.2 answer-key coverage integrity

Further changes on PR #20's statistical branch make the answer key the authoritative expected-output inventory. Analysis now rejects any rater-submitted blind output ID absent from the answer key and reports expected outputs, each rater's submitted count, matched outputs, and missing-from-each-rater counts. Tests cover incomplete submissions and unknown blind IDs.

Commits: 2661272240defff3951f60faa4a2de7a8c05ec2c, d7f8659000f5617a7fd578419e6ed757e2189b1e.

CI status for the latest head is still unavailable (no workflow run or combined status returned). H2.2 remains open until exact-head tests pass and the PR #20/#21 hybrid is consolidated and verified.


### RI.4.2 — CI feedback loop for H2.2 hardening

PR #20's latest reviewed run (#321) has passed regression tests, TypeScript, lint, SQLite production build, and PostgreSQL schema validation; its stakeholder API/browser E2E job was still in progress at the latest poll.

PR #21's first run (#323) failed two assertions because the tests retained pre-hardening expectations: a degenerate constant-score kappa expected 1 rather than null, and a tamper test matched the previous error wording. Both assertions were corrected in commit 21b073f4416f02a1ec31174d5fe129eb7c380225. A fresh exact-head CI result is pending; do not mark PR #21 green.
