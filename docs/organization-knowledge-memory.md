# Organization Knowledge Memory — H3 retrieval and governance

## Status

The first authenticated read endpoint is implemented at `GET /api/organizations/knowledge-memory`. It reuses accepted `KnowledgeNode` records attached to projects and does not create a second memory store.

The same endpoint now supports an authenticated `PATCH` governance action for explicit review, approval, rejection and archival transitions. A reviewer/approver-only queue is available through `GET ?view=review_queue`.

## Authorization and tenant isolation

1. The route resolves the caller from the signed session cookie using the database-backed identity-session resolver.
2. The resolver revalidates the session, user, membership, organization, status and session expiry against the database.
3. Read access requires `organization:read`; governance actions additionally enforce their action-specific permission in the route.
4. Target nodes are resolved through their project and the verified organization ID. No client-supplied organization or project IDs are trusted.
5. Archived projects cannot contribute to organization-wide retrieval or governance.
6. Read results are restricted to accepted nodes and bounded, source-attributed summaries.
7. The proxy classifies GET/HEAD as `organization:read` and PATCH as an authenticated entry gate; the route then checks the exact action permission.

## Retrieval contract

- Query parameters: `q` (label/description search), `kind` (allowlisted node kind), `limit` (1–1000 input, clamped to 100 by the query builder).
- Default result limit: 25; maximum returned: 100.
- Default view returns only accepted nodes.\n- `view=review_queue` returns only `in_review` nodes and requires `requirements:review` or `requirements:approve`; writers and viewers cannot enumerate the queue.
- Each item retains `projectId`, `projectName`, and stable `nodeRef` provenance.
- Descriptions are capped at 1,200 characters; confidence is clamped to [0, 1].
- Claims, private evidence text, credentials and arbitrary project records are not returned.

## Governance contract

Send `PATCH /api/organizations/knowledge-memory` with `nodeId`, `action`, and optional `reason` (maximum 500 characters).

| Action | Allowed source state | Result | Required permission |
|---|---|---|---|
| `submit_for_review` | proposed | in_review | `requirements:write` |
| `reject` | in_review | rejected | `requirements:review` |
| `approve` | in_review | accepted | `requirements:approve` |
| `archive` | accepted or rejected | archived | `requirements:approve` |

Transitions use a compare-and-set status guard inside a database transaction. The matching `DecisionEntry` audit record is written in the same transaction, so a failed audit write rolls back the state change. Invalid state transitions return a conflict instead of silently overwriting another reviewer’s decision. The audit detail records the authenticated user ID, node reference, transition and bounded reason.

## Organization audit stream\n\n- Endpoint: `GET /api/organizations/audit`; requires `audit:read`.\n- Uses a dedicated `OrganizationAuditEvent` model, not only project-scoped `DecisionEntry` rows.\n- Events are scoped by the verified session organization and support bounded filters for event type, actor, project, and time range.\n- Cursor pagination is stable by creation time and ID; actor email and session secrets are never serialized.\n- Governance changes write both the legacy project decision journal and organization event in one transaction.\n- `projectId` is a scalar snapshot, so project deletion cannot cascade-delete audit history; organization deletion is restricted while events exist.\n\n## Review queue\n\n- Endpoint: `GET /api/organizations/knowledge-memory?view=review_queue`.\n- Only reviewer, approver, owner and admin roles with the corresponding permission can read the queue.\n- Results are limited to the caller organization’s non-archived projects, ordered oldest-first to reduce review starvation, and capped at 100.\n- The queue exposes bounded node metadata and project provenance, not raw evidence or claims.\n- Decisions still use the existing PATCH lifecycle actions and their independent permissions.\n\n## Known boundaries

- This is project-backed retrieval, not yet a separately persisted organization-memory entity.
- Lexical retrieval only; semantic/vector search is not enabled.
- Governance is deliberately limited to explicit transitions; there is no bulk mutation, delete, or automatic promotion.
- Audit events reuse the existing append-only project decision journal. A dedicated organization-level audit-event store and cross-project audit query remain future work.
- A live-database multi-tenant E2E test remains required before production enablement.

## Next

Add a dedicated organization audit stream, review queue UI, semantic retrieval with tenant filtering before vector search, and live-database tenant-isolation integration tests. The review-queue API and dedicated organization audit persistence foundation are implemented; the audit reader API, UI, semantic retrieval and live database isolation tests remain.
