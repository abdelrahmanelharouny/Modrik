# Organization Knowledge Memory — H3 retrieval slice

## Status

The first authenticated read endpoint is implemented at `GET /api/organizations/knowledge-memory`. It reuses accepted `KnowledgeNode` records attached to projects and does not create a second memory store.

## Authorization and tenant isolation

1. The route resolves the caller from the signed session cookie using the database-backed identity-session resolver.
2. The resolver revalidates the session, user, membership, organization, status and session expiry against the database.
3. The route requires the verified role to have `organization:read`.
4. It derives project IDs exclusively with a server-side query scoped to the verified `organizationId`.
5. The query builder scopes every result to those project IDs and `status: accepted`; no client-supplied organization or project IDs are used.
6. The proxy also classifies the route under `organization:read`, so the endpoint is covered by the global API authorization policy.

The route returns 401 for missing/invalid identity, 403 for insufficient permission, 400 for malformed limits, and 503 when identity resolution or retrieval is unavailable. Responses are marked `no-store`.

## Retrieval contract

- Query parameters: `q` (label/description search), `kind` (allowlisted node kind), `limit` (1–1000 input, clamped to 100 by the query builder).
- Default result limit: 25; maximum returned: 100.
- Only accepted nodes are returned.
- Each item retains `projectId`, `projectName`, and stable `nodeRef` provenance.
- Descriptions are capped at 1,200 characters; confidence is clamped to [0, 1].
- Claims, private evidence text, credentials and arbitrary project records are not returned.

## Known boundaries

- This is project-backed retrieval, not yet a separately persisted organization-memory entity.
- Retrieval is lexical over labels and descriptions; semantic/vector search is not enabled.
- No organization-level write, promotion, supersession or archive workflow is exposed yet.
- Access audit events and human curation audit events remain a follow-up; this slice does not claim them.
- Cross-tenant protection is enforced by deriving project IDs from the verified organization and by the query's projectId allowlist. A dedicated live-database multi-tenant E2E test remains required.

## Next

Add auditable curation lifecycle (propose, review, promote, supersede, archive), explicit source retention/deletion semantics, and tenant-isolation integration tests before enabling semantic retrieval.
