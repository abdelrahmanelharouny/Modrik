# Modrik — accessibility and Arabic RTL verification plan

**Purpose:** close the gap between responsive smoke tests and a defensible workspace accessibility review. Automated checks are evidence, not certification; manual assistive-technology review remains required.

## Verified automated coverage

- PR #48 adds skip-link, visible-focus and form-label checks in the existing browser integration suite.
- PR #50 covers all seven authenticated workspace views at 390px in English, plus tablet/desktop overflow checks; Arabic coverage initially covered Briefing and Debrief.
- PR #56 extends Arabic RTL checks to Briefing, Route Plot, Airframe, Turbulence Scan, Payload, Clearance and Debrief at 390px, and verifies locale/direction persist after reload. Its exact-head CI run [42394350241](https://github.com/abdelrahmanelharouny/Modrik/actions/runs/42394350241) passed both jobs. The PR is still open and must not be represented as merged.

## Required verification matrix

| Area | Automated evidence to retain | Manual review still required |
|---|---|---|
| Language and direction | Assert `html[lang]`, `dir`, locale persistence after reload and no horizontal overflow | Check mixed Arabic/English text, numbers, dates, punctuation and screen-reader pronunciation |
| Keyboard | Tab/Shift+Tab traversal, skip link, visible focus, Escape behavior, no keyboard traps | Complete each critical workflow without a pointer, including menus, dialogs and data tables |
| Names and errors | Programmatic labels, descriptions, invalid state, field-error association and live status announcements | Confirm errors and progress are understandable with NVDA/VoiceOver |
| Visual presentation | Contrast token checks in both themes, zoom/reflow and reduced-motion preference | Inspect focus indicators, chart semantics, disabled states and color-independent status |
| Responsive layout | 390×844, 768×1024 and 1440×900; no unintended page overflow or clipped action bars | Test real device/browser combinations and long translated content |
| Workflow completion | Authenticated journey across all seven views in both locales | Screen-reader completion and recovery from validation/network errors |

## Execution protocol

1. Use a clean synthetic account/project in an isolated database; never use production records.
2. Record commit SHA, browser/version, operating system, viewport, locale, theme and assistive technology.
3. Run the automated suite and attach screenshots, console output and failed-request diagnostics with secrets redacted.
4. Perform keyboard-only and screen-reader passes on every critical stage and Debrief.
5. File defects with a reproducible route, expected/actual behavior, severity and evidence; retest the exact fixed commit.
6. Keep automated pass, manual pass and formal conformance claims as separate statuses.

## Exit criteria

- [ ] Automated matrix passes on the final release candidate.
- [ ] No critical keyboard, focus, language, label or error-announcement defects remain.
- [ ] Manual screen-reader review is recorded for the authenticated six-stage journey and Debrief.
- [ ] Contrast/reduced-motion and responsive checks are recorded for both themes and both locales.
- [ ] A reviewer signs off the evidence record.

**Limit:** passing the current RTL overflow tests does not imply WCAG conformance or a complete accessibility audit.
