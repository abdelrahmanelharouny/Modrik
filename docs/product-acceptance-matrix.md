# Modrik — product acceptance matrix (P0)

This is the execution contract for the remaining real-app acceptance pass. It intentionally separates automated CI evidence from manual product/research sign-off. Do not mark a row passed because a component exists or because a unit test passes.

## Test fixture and invariants

Use a disposable SQLite database seeded only with synthetic records, a configured test owner, and deterministic provider stubs. Never point this suite at a shared or production database. Preserve diagnostics (screenshots, browser console, failed requests, response bodies with secrets redacted) on failure.

Global invariants for every stage:
- The authenticated owner can read and mutate only projects in the active organization; unauthenticated requests fail closed.
- A stage can be run only from `awaiting_input`, reviewed only from `awaiting_review`, and cannot be run/approved twice concurrently.
- Agent output is review material, never an automatic human approval.
- Refreshing or reopening the workspace preserves persisted project state and the currently active pipeline stage.
- Failed requests show a recoverable error and do not silently advance the stage.
- Every human decision that changes project meaning is represented in the decision journal.
- Keyboard focus remains visible; controls have accessible names; Arabic mode sets `lang=ar` and `dir=rtl`; no horizontal overflow at 390px.

## Six-stage journey

| Stage | Setup and action | Required assertions | Negative / recovery cases |
|---|---|---|---|
| 1. Elicitation | Create project with a realistic brief and at least two evidence sources. Run Questioner/Planner; answer one question as a human and explicitly mark another as proceed-with-uncertainty. | Questions persist with answer source and resolution; uncertainty is explicit; planner arm is recorded; stage waits for human review; approve advances exactly once to Problem Selection. | Synthetic Wind Tunnel answers alone cannot satisfy the gate; empty questions cannot be approved; invalid planner arm returns 400; duplicate concurrent approval returns 409. |
| 2. Problem Selection | Run Scope Agent; score impact and effort; select one candidate. | Exactly one selected problem persists; scores are bounded 1–5; human selection is journaled; approve advances to Extraction. | Zero or multiple selected candidates block approval; invalid score and cross-project candidate IDs are rejected; competing selections cannot leave two selected candidates. |
| 3. Requirement Extraction | Run Proposer/Critic; review every extracted requirement and attach source evidence; record supported or weak human verdicts. | Each approved requirement has a live evidence ID trace link; verification source is human; provenance and revision references remain intact; edits invalidate stale verification; approve advances to Ambiguity. | No requirements, orphan requirements, missing evidence links, agent-only verdicts, stale evidence or foreign-project evidence block approval. |
| 4. Ambiguity Analysis | Run ambiguity analysis; inspect score, flagged phrases and suggested rewrite; accept or retain original text. | Human-selected text is persisted; original/rewrite history is auditable; ambiguity score and Arabic lexicon output remain visible; approve advances to Stories. | Agent suggestions are never silently applied; stale UI cannot overwrite a newer requirement revision; failed save leaves the original unchanged. |
| 5. User Stories | Run Story Agent; review narrative, Gherkin-style acceptance criteria and INVEST score. | Stories reference valid requirements; acceptance criteria persist; story edits are journaled; approve advances to Conflicts. | Empty story set blocks approval; invalid/foreign requirement references are rejected; retry does not duplicate stories. |
| 6. Conflict Detection | Run Consistency Agent; inspect contradiction/duplication/overlap findings and implications; enter a human resolution for every finding. | Each resolution is human-authored and persisted; unresolved count reaches zero; decision journal records each resolution; approval marks project complete exactly once. | Empty resolution cannot be saved; unresolved or unknown statuses block completion; stale concurrent resolution cannot silently overwrite another decision. |

## Debrief acceptance

After completion, open Debrief and verify each instrument independently:
- Project baseline and JSON export represent the same persisted requirements, stories, evidence links and conflict decisions.
- Knowledge graph shows typed nodes/edges and source provenance; reverse traceability and impact traversal stay project-scoped.
- Health, drift, compliance, calibration, executability and wind-tunnel outputs expose their assumptions and do not present synthetic data as observed participant data.
- Decision journal is chronological, project-scoped and exportable; audit export contains no credentials or session material.
- Planner Lab shows all four arms only when real run records exist; metrics are labeled with their measurement definitions.
- Integration console reports configured/deferred states honestly. OAuth activation is deferred; static-token integrations are the supported MVP path.
- Reopen baseline requires explicit user action, changes status to active and preserves prior decisions/history.

## Responsive, language and accessibility matrix

Run the same critical journey at 390×844, 768×1024 and 1440×900:
- English LTR and Arabic RTL; reload each locale and verify direction persists.
- Keyboard-only: skip link, logical tab order, all dialogs, selects, tabs, toasts/errors and destructive confirmations.
- Focus visible on every interactive element; no keyboard trap; Escape closes dismissible dialogs.
- Inputs have programmatic labels; validation errors are associated with fields and announced; status changes are announced without relying on color.
- Reduced-motion preference disables nonessential transitions; contrast and target-size checks cover both themes.
- No clipped action bars, inaccessible horizontal tables or unintended horizontal page scroll.

## Reliability and concurrency matrix

- Two tabs in one project serialize offline sync; separate projects proceed independently.
- Abrupt tab close plus lease expiry permits recovery with a strictly newer fencing token; stale owners cannot renew, release or acknowledge.
- Suspend/resume, browser restart, interrupted fetch, 429, 5xx and offline/online transitions preserve queued operations and use bounded retry.
- Idempotency prevents duplicate creates after a response is lost and the request is retried.
- Revision conflict remains visible until explicit rebase/discard; no silent overwrite or queue deletion.
- Concurrent project/evidence/graph reads and writes preserve tenant isolation and referential integrity under representative load.

## Evidence record

For every executed row, record: commit SHA, environment/database type, browser/version, viewport, locale, fixture identifier, pass/fail, duration, artifact links, and reviewer. Keep manual screen-reader and visual sign-off distinct from automated checks.

**Release rule:** this matrix is not itself proof of acceptance. The full authenticated journey, debrief checks, and live-provider/staging rehearsal remain open until executed and recorded against a clean release candidate.


## Verified repository evidence — post PR #56 merge (2026-11-07)

- **PR #56 is merged** into canonical `main` at merge commit `0133d10145468237e1db6127737cc1b3af9910b3`. Its exact-head CI run [42394350241](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42394350241) passed `quality` and `postgres-schema`. Arabic RTL coverage now includes all seven authenticated workspace views at 390px and locale/direction persistence after reload.
- PR #54 provides the deterministic six-stage agent/API integration journey with six human approval gates; this is not the same as a single browser-driven journey from project creation through all six stages.
- PR #67 is the current-main reapplication of the PR #61 browser bridge from the completed deterministic agent journey into authenticated Mission Control and Debrief, including evidence/requirement constellation assertions. It remains open and is not part of `main`.
- PR #68 is the current-main reapplication of PR #62 Chromium/IndexedDB coverage for expired-lease takeover and stale acknowledgement rejection; it now requires a successful mocked server confirmation before the recovery owner acknowledges. It remains open and is not part of `main`.
- Original PRs #61/#62 are stale-base duplicates of #67/#68 respectively; verify no unique commits remain before closing them.
- The reliability implementation includes capped exponential retry (5 seconds to 5 minutes), FIFO head-of-queue blocking, human-review pauses for revision/permission/validation/idempotency failures, and explicit update rebase/discard controls. PR #64 adds unit coverage for delay progression, failure classification and the lifecycle-deferral/manual-override policy; browser-level timer/lifecycle integration remains unverified.

These facts describe repository code and CI evidence only. The complete create-project → evidence → six human gates → Debrief browser journey, manual screen-reader review, real-provider checks, participant research and staging rehearsal remain open until executed against a clean release candidate with retained artifacts.

## Verified browser coverage — PR #72 and rebased follow-on PR #75 (2026-11-09)

- PR #72 head `b3856705a470e6dc1de7449bbbdd462c2dda537b` passed exact-head GitHub Actions run [42545077703](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42545077703): both `quality` and `postgres-schema` succeeded, including production build, TypeScript, lint, regression, offline browser integrations and stakeholder API/browser E2E. PR #72 is now merged into `main` at `2be5bde4080615468f980171c3239fc0536d496b`.
- The browser journey creates a fresh project through Mission Control, captures evidence with persisted consent, runs Questioner/Scope/Extraction from the UI, and exercises their human review/approval gates. Assertions cover decision-journal persistence, no silent problem-route selection, evidence-linked requirements and human verification.
- The follow-on test extension runs Ambiguity, Stories and Consistency via browser controls, approves the remaining human gates, and verifies completion, 12 persisted pipeline runs, six human approvals and Debrief provenance. Original stacked PR #74 passed exact-head run [42546370129](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42546370129), then was closed as superseded because its branch retained the pre-squash PR #72 ancestry. The same incremental test change was rebased directly onto current `main` as PR #75; its fresh exact-head CI is pending.
- PR #75 is a one-commit follow-on against current `main`, containing only the incremental browser journey changes. Do not treat the original #74 CI run as proof for the rebased branch.
- **Still open:** manual accessibility/screen-reader review; live-provider checks; participant research; representative load/concurrency checks; and staging rehearsal. Re-run the full journey on a clean release candidate after the stacked PRs are integrated.

This is verified repository/CI evidence only. It does not establish production readiness or complete product acceptance.
