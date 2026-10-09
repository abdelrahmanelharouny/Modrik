# Modrik (مدرك) User Study Protocol (dev item 14)

Three-group between-subjects experiment measuring whether an evidence-based,
human-in-the-loop agentic RE platform reduces stakeholder-interview burden and
improves baseline quality compared with both the traditional craft and an
unconstrained LLM chat.

- **Version:** 1.0 · **Status:** protocol ready, data collection not started
- **Populations:** 2–3 university software-engineering / student teams
  (pilot sites not yet signed — see FEATURES_STATUS.md)
- **Data handling:** anonymised participant codes only; Egypt PDPL-aligned
  consent; recordings and transcripts deleted after analysis; export is the
  anonymised CSV at `GET /api/study?export=csv`.

## 1. Design

| Element | Decision |
| --- | --- |
| Layout | Between-subjects, 3 arms |
| Groups | **A_traditional** (docs + spreadsheet craft) · **B_unconstrained_llm** (free-form LLM chat) · **C_modrik** (this platform) |
| Tasks | 1 benchmark scenario per participant pair, drawn from `bench/scenarios` (arbench-v2), matched on category and difficulty across groups |
| Duration | 60-minute task + 15-minute debrief per session |
| Assignment | Randomised within team; stratified by prior RE coursework (yes/no) |
| Unit of analysis | Session (participant pair), n ≥ 12 per group for the pilot |
| Recording | Platform journals (group C), screen recording (all groups), moderator notes |

Randomisation is performed by the moderator with sealed envelopes per team;
the scenario is sampled from the manifest so each group sees the same domain
mix. Group C sessions bind to a `StudySession` row (model `StudySession`,
`projectId` set) so platform telemetry attaches to the right arm.

## 2. Task scripts

**A_traditional.** Participants receive the scenario evidence pack as printed
documents plus a blank spreadsheet. Script: "Produce a requirements baseline
for this project: clarifying questions you would ask, the requirement list
with priorities, and any conflicts you notice. You have 60 minutes."

**B_unconstrained_llm.** Same evidence pack; a chat LLM (GLM via the default
provider, same
underlying model as group C's default provider — model difference is
controlled) in a bare chat window with no system prompt and no tooling.
Script: "Use this assistant however you like to produce the same deliverables."

**C_modrik.** Same evidence pack loaded into a fresh project.
Script: "Produce the same deliverables with the platform; run the journey,
answer or mark uncertainties, resolve conflicts, and land the baseline."

Moderators intervene only for tool failures; help requests are logged as
`StudyEvent(kind="note")` entries (group C records them automatically in the
decision journal).

## 3. Measures

### 3.1 Primary — interview burden (NASA-TLX)

Raw NASA-TLX (0–100 per dimension, 20-point gradations), collected
immediately post-task for every group:

- Mental demand · Physical demand · Temporal demand
- Performance · Effort · Frustration

The overall TLX is the mean of completed dimensions; `overall` is recomputed
in the CSV export. **H1:** group C reports lower temporal demand and
frustration than both A and B (Mann-Whitney on pairs, α = .05).

### 3.2 Secondary — baseline quality (rubric, blind-rated)

Two RE-literate raters, blind to group, score each deliverable 0–5 per item:

1. **Coverage** — distinct stakeholder needs represented
2. **Atomicity** — single testable statements ("The system shall …")
3. **Measurability** — quantified quality attributes (no bare "fast")
4. **Traceability** — each requirement points at its source evidence
5. **Conflict handling** — conflicts surfaced and dispositioned
6. **Assumption honesty** — unknowns recorded rather than silently assumed

Inter-rater agreement: Krippendorff's α ≥ .67 target; disagreements resolved
by discussion. **H2:** group C scores higher on traceability and assumption
honesty than A and B.

For group C, the platform's deterministic instruments triangulate the
raters: debt profile (ambiguity/verification/traceability/executability
dimensions from `/api/projects/[id]/health`), calibration (Brier/ECE from
`/api/projects/[id]/calibration`), and executability discovery rate.

### 3.3 Tertiary — efficiency and usability

- Task time (`taskTimeSec`), counted from brief exposure to deliverable freeze
- Question utility realised (group C): planner metrics from the Planner Lab
- SUS (0–100) for groups B and C
- Help-request count per session

## 4. Procedure (per session)

1. Consent signature (Arabic or English, PDPL notice, right to withdraw)
2. 5-minute tool familiarisation (A: spreadsheet template; B/C: guided tour)
3. Task (60 min, timer visible to moderator only)
4. NASA-TLX + SUS questionnaire
5. Semi-structured debrief (8 questions, recorded)
6. Anonymised code assigned; name sheet stored separately and destroyed

## 5. Analysis plan

- Between-group comparisons: Kruskal-Wallis; significant effects probed with
  Dunn post-hoc and rank-biserial effect sizes (normality is not assumed at
  pilot n).
- Paired group contrasts (H1/H2): Mann-Whitney U with Bonferroni
  correction across the three pairwise contrasts.
- Quality rubric: per-item group medians with 95% bootstrap CIs.
- Platform telemetry (group C): descriptive — debt dimensions, calibration
  verdict, planner ablation means; used to explain, not substitute, rater
  outcomes.
- Pre-registration: hypotheses and analysis plan frozen in this document
  before recruitment; deviations reported explicitly.

## 6. Threats to validity

- **Experimenter novelty:** group C gets a guided tour; B gets a bare chat.
  Mitigation: equal-time familiarisation, help logging.
- **Model identity:** B and C share the GLM default provider so the contrast is
  tooling, not model.
- **Task familiarity:** scenarios are fictional but domain-grounded; teams
  are randomised to scenarios unknown to all groups.
- **Small n:** pilot is explicitly a feasibility + power-estimation study;
  no confirmatory claims at this stage.
- **Moderator effects:** same moderator script read verbatim in all sessions.

## 7. API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/study` | open a session `{groupId, participantCode, scenarioId, projectId?}` |
| `PATCH /api/study` | log events, task time, NASA-TLX `{mental, physical, temporal, performance, effort, frustration}`, SUS, finish |
| `GET /api/study` | session listing (masked, for moderation dashboards) |
| `GET /api/study?export=csv` | anonymised analysis export |

Groups: `A_traditional` · `B_unconstrained_llm` · `C_modrik`.
