# Modrik (مدرك) — Production-Stage Proposal
**Companion to FEATURES_STATUS.md · 2026-10-10 · LLM: GLM (default, swappable)**

This document proposes what it takes to move Modrik from a research-grade,
single-deployment platform to a production offering that stands alone in the market —
while protecting the two non-negotiables: the core (evidence-grounded, human-in-the-loop
agentic RE) and full dynamicity (registry-driven UI, zero hardcoded numbers).

---

## 1 · Positioning — why this is a category, not a feature

Traditional RE suites (Jira requirements plugins, DOORS, Polarion) digitise documents;
LLM chat produces plausible text with no accountability. Modrik occupies the
empty middle: **agentic elicitation with receipts** — every statement grounded in cited
evidence, every unknown either asked or carried as a visible assumption, every decision
journaled. The moat is the combination of four machines that competitors would each have
to rebuild:

1. **The impact-aware Question Planner** (utility formula + 4-arm ablation) — a
   *measurable* elicitation engine, not a prompt.
2. **UNDEFINED-as-discovery executability** — the system profits from its own ignorance,
   turning baseline silence into new requirements.
3. **The Arabic-native layer** (Egyptian dialect + code-switching, voice-first) — no
   Western RE tool treats Arabic speakers as first-class stakeholders.
4. **The trust spine** (journal, calibration, debt decomposition, constraint-pack
   dual role) — auditability as a product surface, not a compliance chore.

Positioning line: *"The requirements platform that shows its work."*

## 2 · Reliability — from hardened to boring

Already in place: transport retries, parse-retry with truncated-JSON structural repair,
evidence budgets, per-run usage accounting, graceful integration degradation.

Next increments (P0 → P2):
- **P0 — Circuit breaker + provider pool.** When GLM errors exceed a threshold, the
  provider interface (already swappable) falls back to Model B / local automatically;
  the journal records the failover. This converts the provider interface from a research
  feature into an availability feature.
- **P0 — Agent run queue.** Move stage runs from request-scoped awaits to a persistent
  job queue (even a SQLite-backed one) so browser closes, deploys, and crashes never
  orphan an agent mid-stage; UI already polls stage status.
- **P1 — Structured logging + run replay.** Artifacts already snapshot every stage
  output; add prompt-versioned replay so any baseline can be regenerated deterministically
  for debugging or thesis review.
- **P2 — Chaos drills** in CI: kill the provider mid-stage, truncate JSON at random
  offsets, corrupt Arabic input encoding — the audit harness (`scripts/agent_tests/`)
  generalises into a fault-injection suite.

## 3 · Deployment — two topologies, one image

- **Topology A — University research/lab (primary pilot target):** single Docker
  Compose (app + Postgres + optional Ollama container for `RP_LLM_PROVIDER=local`);
  evidence never leaves the campus; PDPL residency satisfied by construction. The
  local-provider path is already implemented and self-audited.
- **Topology B — Public demo (marketing surface):** same image, GLM default, read-only
  demo seeds, per-session rate limiting, and the existing masked-credential rules.
- **P0 artifacts:** Dockerfile + compose file + one-command bootstrap; env matrix
  documented (`RP_LLM_PROVIDER`, `RP_MODEL_B_*`, `RP_LOCAL_*`, `RP_GITHUB_*`, `RP_JIRA_*`,
  `RP_PLANNER_ARM`).
- **P1:** health/readiness endpoints (self-audit already provides the substance —
  wrap it as `/healthz`), zero-downtime migrate (Prisma migrate flow replacing
  `db push` in production mode).

## 4 · Persistence & data growth

- **SQLite → Postgres** is a config flip in Prisma (schema is portable; no SQLite-specific
  columns used). P0 for any multi-team deployment.
- **P1 — Retention & erasure automation:** PDPL right-to-erasure exists as cascade
  delete; add scheduled purge jobs and an export-your-data path (the JSON baseline export
  already covers 80%).
- **P1 — Artifact compaction:** stage snapshots grow unbounded; tier old artifacts to
  cold storage while keeping journal integrity (journal stays append-only forever).

## 5 · Security & privacy (the PDPL story is a selling point)

Already shipped: server-side credential storage with masking, consent registry,
evidence budgets, local-provider residency, right-to-erasure cascade.

- **P0 — Auth layer.** The research demo intentionally has none; production needs
  team accounts (email/OAuth SSO via university IdPs — SAML/Shibboleth is the natural
  university fit), org → project scoping, and role gates on destructive actions.
- **P0 — Secrets vault.** Move Integration credentials from the DB row to encrypted
  columns (AES-GCM with a deployment key) — the masking contract already hides them
  from clients.
- **P1 — Audit export signing** (hash chain on the journal) so thesis-grade claims
  about "immutable" are cryptographically defensible.
- **P1 — Arabic PII scanner** in the evidence intake path (extend the existing
  redaction action with Arabic name/phone/National-ID patterns).

## 6 · Collaboration — from single analyst to team

- **P0 — Shared missions:** the auth layer unlocks multi-user projects; the decision
  journal already attributes every action, so per-human accountability comes free.
- **P1 — Interview co-pilot mode:** the stakeholder joins a lightweight view (answer
  questions, voice notes) while the analyst drives — built directly on the existing
  question/HITL APIs; the Arabic-native question flow makes this the killer demo for
  Egyptian stakeholders.
- **P2 — Negotiation threads:** conflict resolution currently accepts a single human
  verdict; threaded discussion + multiple reviewer sign-off turns the negotiation table
  into a stakeholder meeting surface.

## 7 · Scalability of the *research* claims

- **P0 — Benchmark CI:** run arbench-v2 (120 scenarios) through the pipeline nightly;
  persist per-scenario, per-arm metrics; the ablation lab becomes a dashboard over
  accumulated runs instead of per-project runs. This is the single highest-leverage
  item for the thesis: it converts 4 seeded runs into a distribution.
- **P0 — Judge sharpening:** the seeded ablation showed set-level judge metrics flat
  across arms; add blind pairwise comparison between two anonymised question sets and
  Elo-style aggregation.
- **P1 — Pilot instrumentation:** StudySession rows + NASA-TLX + CSV export are ready;
  add the analysis notebook (Kruskal-Wallis/Dunn) so pilot data lands pre-analysed.

## 8 · Radical extensions (kept honest, ranked by leverage)

1. **Drift → integration loop (P1):** GitHub/Jira issue state changes flow back as
   drift signals — the requirement graph (typed edges + traversal already live) makes
   this a graph query, not a rebuild.
2. **Planner-as-policy API (P2):** expose the utility formula with pluggable weights so
   research collaborators can run their own selection policies against the same judge —
   the platform becomes the *venue* for elicitation-policy research.
3. **Voice-first interviews (P2):** the existing voice-note + ASR path extends to
   whole interview sessions — the agent listens, the planner decides what to ask next,
   everything transcribed as evidence. This is the most revolutionary UX for
   low-literacy or hands-busy stakeholders and no RE tool does it.
4. **Executable-baseline bridge (P2):** Gherkin skeletons already export; round-trip
   failing test results back as executability discoveries.

## 9 · Sequence to production (compressed)

| Horizon | Ship |
| --- | --- |
| Weeks 1–3 | Docker/compose topologies, auth + RBAC skeleton, encrypted credentials, benchmark CI + judge sharpening |
| Months 2–3 | Postgres default, run queue + failover, signed audit export, pilot recruitment (2–3 universities) using the ready study protocol |
| Months 4–6 | Interview co-pilot mode, drift↔integration loop, planner-as-policy API, public demo hardening |

The descope ladder mirrors the analysis report's discipline: the trust spine and the
Planner are never descoped; everything else has an order of exit.
