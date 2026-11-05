# Organization Knowledge Memory — H3 retrieval and governance

## Status

The authenticated organization memory read endpoint reuses accepted KnowledgeNode records attached to projects; it does not create a second memory store. Governance transitions and the reviewer/approver queue are implemented, with a dedicated organization audit stream.

Semantic retrieval architecture is recorded in ADR-018. The implementation adds a multilingual BM25 baseline and safe lexical/semantic/hybrid ranking primitives, but semantic retrieval is not enabled or connected to an embedding provider.

## Authorization and tenant isolation

1. The route resolves the caller from the signed session cookie using the database-backed identity-session resolver.
2. The resolver revalidates the session, user, membership, organization, status and session expiry against the database.
3. Accepted-memory reads require organization:read; review-queue reads additionally require requirements:review or requirements:approve.
4. Target nodes, project lists and audit reads are scoped by verified identity.organizationId. Identities without non-empty organization, actor and role scope are rejected before Prisma queries. Client-supplied organization or project IDs are never trusted.
5. Archived projects are excluded from retrieval, review and governance.
6. Accepted-memory and review-queue serializers expose bounded, source-attributed summaries, not raw evidence or arbitrary project records.
7. Governance actions enforce their exact permission again at mutation time.

## Retrieval contract

- Query parameters: q (label/description search), kind (allowlisted node kind), limit (1–1000 input, clamped to 100).
- Default result limit: 25; maximum returned: 100.
- Default view returns only accepted nodes.
- view=review_queue returns only in_review nodes and requires reviewer or approver permission.
- Each item retains project ID, project name and stable node-reference provenance.
- Descriptions are capped at 1,200 characters; confidence is clamped to [0, 1].
- HTTP retrieval remains lexical-only. The ranking module adds multilingual normalization, BM25 and RRF primitives; it is not wired to semantic storage.

## Governance and audit

Governance transitions use compare-and-set status guards inside a database transaction. The project decision-journal row and organization audit event are written in that same transaction, so a failed audit write rolls back the state change. Conflicts return HTTP 409 rather than overwriting another reviewer's decision.

The review reader is /settings/knowledge-memory. The audit reader is /settings/audit and uses a dedicated organization audit stream scoped by verified session organization. Actor email and session secrets are never serialized. Project ID is a scalar snapshot, preserving audit history if a project is deleted.

## Known boundaries and next gates

- This is project-backed retrieval, not a separately persisted organization-memory entity.
- Semantic/vector search is not enabled. Follow ADR-018: provider selection, tenant-filtered storage adapters, embedding lifecycle/outbox, deletion/re-embedding and multilingual benchmark must pass before rollout.
- Governance is explicit; no bulk mutation, delete, or automatic promotion.
- PostgreSQL integration coverage creates two isolated organizations and verifies accepted-memory and audit reads cannot cross tenant boundaries. It races two compare-and-set governance transitions and injects an audit foreign-key failure to prove atomic rollback. These focused integration tests are not a substitute for production load testing.
- Real-world pilot recruitment, rater calibration and empirical H2 evaluation remain separate research gates.
