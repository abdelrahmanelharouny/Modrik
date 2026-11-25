# Phase 4 — Product & Business Expansion

**Implementation branch:** `feat/phase-4-enterprise-product-expansion`  
**Status:** implementation in progress; no live payment provider, enterprise identity provider, or production data-retention executor is configured.

Phase 4 moves Modrik from a capable project workspace toward a multi-organization SaaS and enterprise requirements-governance product. The implementation is tenant-scoped and deliberately separates verified product behavior from provider-dependent activation.

## Delivered in this workstream

### Organization onboarding
- Authenticated organization discovery and self-service workspace creation.
- Atomic organization + owner membership + initial subscription + governance policy + audit event creation.
- Organization switch after creation using the existing session-rotation contract.
- Per-user creation rate limits.

### Portfolio intelligence
- Organization portfolio endpoint with project lifecycle, stage progress, evidence/requirements/stories/stakeholder counts, pending drift reviews, dead agent jobs, member counts, baseline counts and current-month usage.
- Bilingual Enterprise Workspace console with organization switch context, portfolio metrics and per-project baseline access.

### Baseline registry
- Immutable project baseline snapshots with monotonically allocated versions and SHA-256 content hashes.
- Snapshot gate requires a completed final stage, approved requirements and resolved conflicts.
- Snapshot content captures requirements, stories, conflict dispositions, evidence references and a bounded decision-journal extract.
- Side-by-side version comparison reports added, removed and changed requirements, stories and conflicts.
- Baseline creation is journaled and organization-audited. No update/delete endpoint is provided.

### Commercial foundations
- Provider-neutral Free / Team / Business / Enterprise plan catalogue.
- Organization subscription record and plan entitlement view.
- Serializable project-limit enforcement and active/invited seat-limit enforcement.
- Idempotent usage ledger entries are written by the durable agent worker in the same transaction as successful job completion.
- Usage and estimated cost are exposed in the organization portfolio and usage endpoints.

**Billing boundary:** token and dollar values are estimates from the existing agent telemetry, not provider invoices or actual payment amounts. No checkout, payment method, charge, tax calculation, invoice issuance, payment webhook, dunning or payment-provider credentials are active. Plans remain manual entitlement records until a payment provider and finance/legal configuration are approved. Token quotas are visible/advisory; hard token reservation requires preflight estimation and atomic budget reservation before an LLM call.

### Governance and compliance
- Organization policy for evidence/data/audit retention windows, AI-processing enablement, permitted AI providers and default locale.
- AI routes are denied when processing is disabled or the configured provider is not allow-listed.
- Retention holds are scoped to verified organization resources and audited on placement/release.
- SHA-256 manifested enterprise JSON package includes organization roster, project portfolio, baseline hashes, audit stream, usage totals and retention holds.
- Export explicitly states caps, truncation and legal limitations.

**Retention boundary:** policy and hold records are implemented, but no automated erasure worker runs. No data is deleted merely because a retention period has elapsed. Retention execution, backup erasure, legal holds, appeal/export, and cross-system deletion need approved legal policy, restore/retention tests and a separate executor.

## Additional enterprise work still requiring a separate activation gate

- SAML/OIDC enterprise SSO, IdP metadata, JIT/SCIM provisioning, domain verification and tenant-specific login policy.
- MFA enrollment/recovery/step-up and enterprise session controls.
- Payment-provider integration, checkout, webhook signature verification, invoices, refunds, taxes, proration, dunning and a billing reconciliation ledger.
- Atomic token-budget reservation and hard quota enforcement for long-running LLM tasks.
- Automated retention/erasure executor with legal-hold precedence, dry-run, approvals, tombstones, retry, audit and backup lifecycle integration.
- Full portfolio filtering/search/pagination and team-level workload, cycle-time, quality, risk and capacity trends.
- Production deployment, database migration baselines, backup/restore/rollback rehearsal, live secrets and provider tests.

## Safety and correctness rules

1. Tenant identity comes from the verified session, never a client-supplied organization ID.
2. Baseline versions are write-once. Corrections create a new snapshot, never overwrite history.
3. Every usage event has a source identity and unique idempotency key.
4. Usage cost is an estimate and must never be used as an invoice.
5. Organization AI restrictions are enforced on the server-side proxy boundary.
6. Retention policy is not a deletion command. Expiry alone never authorizes destruction.
7. Compliance export is an integrity-manifested evidence package, not a legal certification.
8. Repository schema inventory is not a deployed-database migration baseline. No production schema changes are authorized by this branch.

## Verification

`tests/phase4-product-foundation.test.mjs` covers entitlement boundaries, baseline diffs, retention validation/hold precedence, compliance package integrity, route permissions, tenant AI policy, idempotent agent metering, and quota enforcement contracts. CI also validates the SQLite and PostgreSQL Prisma schemas and runs the existing browser/API suite.
