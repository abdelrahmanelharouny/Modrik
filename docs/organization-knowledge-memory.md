# Organization Knowledge Memory — H3 foundation

## Status

This change introduces the first safe query/serialization boundary for organization-level knowledge retrieval. It does **not** add a public API route or persist organization-owned memory records yet.

## Source of truth

The first release reuses accepted `KnowledgeNode` records already attached to projects. It does not duplicate content into a second memory store. Every returned item retains its source `projectId` and stable `nodeRef`, so users can inspect where a fact originated.

## Authorization contract

1. Resolve the caller from the verified session, never from client-supplied user headers.
2. Resolve an active organization membership and verify `organization:read`.
3. Resolve the organization's active projects on the server.
4. Pass only those server-derived project IDs to `buildOrganizationKnowledgeQuery`.
5. Query accepted nodes only; proposed, in-review, rejected and archived nodes are excluded.
6. Return bounded summaries with source attribution; never return claims, private evidence text, credentials or unrelated project records by default.

The helper deliberately fails closed when the authorized project list is empty. It is a query builder, not an authorization function; a future route must enforce the complete contract before calling it.

## Retrieval behavior

- Search is limited to label and description.
- Optional node kind is allowlisted.
- Search input is capped at 120 characters.
- Result count defaults to 25 and is capped at 100.
- Stable ordering uses most recently updated first, then ID.
- Summary descriptions are capped at 1,200 characters and confidence is clamped to [0, 1].

## Next implementation slice

- Add a session-backed organization memory route after wiring it to the existing trusted membership resolver.
- Add explicit organization-level memory records only when retention, ownership, provenance, supersession and deletion semantics are finalized.
- Add cross-project retrieval E2E proving that a user cannot enumerate or retrieve a neighboring organization's project IDs.
- Add audit events for memory access and human curation.
- Add semantic retrieval only after tenant filters are enforced before vector search; never rely on post-filtering alone.

## Non-goals

This foundation does not claim semantic/vector search, automatic memory promotion, organization-wide write permissions, or production readiness.
