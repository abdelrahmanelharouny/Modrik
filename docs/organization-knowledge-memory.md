# Organization Knowledge Memory — H3 retrieval and governance

## Status

The authenticated organization memory read endpoint reuses accepted `KnowledgeNode` records attached to projects; it does not create a second memory store. Governance transitions and the reviewer/approver queue are implemented, with a dedicated organization audit stream and reader UI.

## Authorization and tenant isolation

1. The route resolves the caller from the signed session cookie using the database-backed identity-session resolver.
2. The resolver revalidates the session, user, membership, organization, status and session expiry against the database.
3. Accepted-memory reads require `organization:read`; review-queue reads additionally require `requirements:review` or `requirements:approve`.
4. Target nodes and project lists are scoped by the verified `identity.organizationId`. The route explicitly rejects identities without non-empty organization, actor and role scope before issuing Prisma queries; it never relies on Prisma handling of `undefined` filters. Client-supplied organization or project IDs are never trusted.
5. Archived projects are excluded from retrieval, review and governance.
6. Accepted-memory and review-queue serializers expose bounded, source-attributed summaries, not raw evidence or arbitrary project records.
7. Governance actions enforce their exact permission again at mutation time.

## Retrieval contract

- Query parameters: `q` (label/description search), `kind` (allowlisted node kind), `limit` (1–1000 input, clamped to 100).
- Default result limit: 25; maximum returned: 100.
- Default view returns only accepted nodes.
- `view=review_queue` returns only `in_review` nodes and requires reviewer or approver permission.
- Each item retains project ID, project name and stable node-reference provenance.
- Descriptions are capped at 1,200 characters; confidence is clamped to [0, 1].
- Lexical retrieval only; semantic/vector retrieval is not enabled.

## Governance contract

Send `PATCH /api/organizations/knowledge-memory` with `nodeId`, `action`, and optional `reason` (maximum 500 characters).

| Action | Allowed source state | Result | Required permission |
|---|---|---|---|
| `submit_for_review` | proposed | in_review | `requirements:write` |
| `reject` | in_review | rejected | `requirements:review` |
| `approve` | in_review | accepted | `requirements:approve` |
| `archive` | accepted or rejected | archived | `requirements:approve` |

Transitions use compare-and-set status guards inside a database transaction. The matching project decision-journal row and organization audit event are written in that same transaction, so a failed audit write rolls back the state change. Conflicts return HTTP 409 rather than overwriting another reviewer’s decision.

## Review queue UI

- Reader: `/settings/knowledge-memory`.
- Queue API: `GET /api/organizations/knowledge-memory?view=review_queue`.
- Search and kind filters are bounded by the API query builder.
- The API returns the caller's effective review/approval capabilities; the UI only renders actions those capabilities allow.
- Reviewer can reject; approver can approve. These are independent permissions.
- Decisions include an optional bounded rationale, remove the item from the visible queue after success, and refresh on conflict.
- The server remains authoritative; hiding a UI action is not an authorization boundary.

## Organization audit stream

- Endpoint: `GET /api/organizations/audit`; requires `audit:read`.
- Reader UI: `/settings/audit`, with event, project and actor filters plus cursor-based pagination.
- Uses dedicated `OrganizationAuditEvent` persistence, not only project-scoped decision rows.
- Events are scoped by verified session organization; actor email and session secrets are never serialized.
- Governance changes write both the legacy project decision journal and organization event in one transaction.
- Project ID is a scalar snapshot, preserving audit history if a project is deleted; organization deletion is restricted while events exist.

## Known boundaries and next gates

- This is project-backed retrieval, not a separately persisted organization-memory entity.
- Semantic/vector search is not enabled. Do not add vector retrieval until the vector provider, embedding lifecycle, deletion semantics and tenant pre-filter can be verified.
- Governance is explicit; no bulk mutation, delete, or automatic promotion.
- Live-database cross-tenant integration tests and concurrent reviewer stress tests remain required before production enablement.
- Real-world pilot recruitment, rater calibration and empirical H2 evaluation remain separate research gates.
