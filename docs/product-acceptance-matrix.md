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


## Verified repository evidence — 2026-11-07

The following automated coverage is now present on the canonical integration line and must be distinguished from the remaining manual/product acceptance work:

- PR #50 covers navigation across all seven authenticated workspace views at mobile/tablet/desktop sizes, with Arabic checks for Briefing and Debrief.
- PR #51 exercises all six API human-approval gates and verifies evidence grounding before extraction approval.
- PR #54 runs the complete six-stage agent pipeline against a deterministic local OpenAI-compatible fixture, including evidence traceability, human approvals and memory harvest. This is API/integration evidence; it is not the continuous authenticated browser journey described below.
- PR #56 adds Arabic RTL browser checks for all seven workspace views at 390px and verifies locale/direction survive a reload. Exact-head CI run [42394350241](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42394350241) completed successfully for both `quality` and `postgres-schema`. PR #56 remains open until separately reviewed and merged.

These checks do **not** close the complete browser journey, screen-reader review, all responsive/language combinations, live-provider validation or staging rehearsal. Do not mark those rows passed until a new release-candidate run records the commit, browser, viewport, locale and artifacts.
