# OAuth lifecycle — implementation and activation

The GitHub OAuth App and Atlassian OAuth 2.0 (3LO) lifecycle is implemented in the application. Provider activation is a deployment configuration step, not missing core route logic. The connection controls remain unavailable until the matching provider credentials, canonical HTTPS callback origin, signing secret and encryption key are configured.

## Implemented in the repository

- Authenticated, organization-scoped OAuth start routes for GitHub and Jira Cloud.
- Project-update permission checks on start, callback, target selection and disconnect.
- Signed, provider-bound, project/user/organization-bound state with a 10-minute expiry and constant-time comparisons.
- Database-backed one-time state ledger storing only a SHA-256 state hash and transaction ownership metadata; atomic callback consumption prevents replay.
- PKCE S256 challenge/verifier and an HttpOnly, SameSite=Lax, Secure-in-production transaction cookie scoped to the callback path.
- No-store and no-referrer response headers; callback cookie cleared on success and failure.
- GitHub account verification and Atlassian identity + accessible Jira Cloud site verification.
- Access and refresh token encryption at rest using the existing AES-256-GCM secret box.
- Pending OAuth connections are masked and cannot be used by sync adapters until a human selects a target.
- Target-selection endpoint verifies the selected GitHub owner/repository or Jira project against the provider before enabling sync.
- Provider-specific refresh-token handling with compare-and-swap persistence to avoid overwriting a concurrently rotated token.
- Explicit disconnect attempts provider-side revocation before deleting the local encrypted connection; failed revocation retains the local record.
- Connection, target-selection and disconnect actions are recorded in the project decision journal.
- Static-token integration behavior remains supported.

## Routes

- GET /api/projects/:id/integrations/oauth/github
- GET /api/projects/:id/integrations/oauth/jira
- GET /api/integrations/oauth/github/callback
- GET /api/integrations/oauth/jira/callback
- POST /api/projects/:id/integrations/oauth/github/target
- POST /api/projects/:id/integrations/oauth/jira/target
- DELETE /api/projects/:id/integrations/oauth/{github|jira}/target

## Required deployment variables

- MODRIK_APP_URL — canonical HTTPS origin; must match APP_URL and provider callback registrations.
- MODRIK_GITHUB_CLIENT_ID and MODRIK_GITHUB_CLIENT_SECRET.
- MODRIK_ATLASSIAN_CLIENT_ID and MODRIK_ATLASSIAN_CLIENT_SECRET.
- MODRIK_AUTH_SECRET — at least 32 bytes.
- MODRIK_ENCRYPTION_KEY — 32-byte base64 or 64-character hex.

Register these exact callback URLs:

- https://YOUR_HOST/api/integrations/oauth/github/callback
- https://YOUR_HOST/api/integrations/oauth/jira/callback

The GitHub flow currently uses an OAuth App and requests `repo read:user`. This is the lowest-change activation path for the existing user-token sync adapter. For a larger multi-tenant commercial deployment, a GitHub App with installation-scoped, selected-repository permissions is the preferred least-privilege evolution; it requires a separate installation-token adapter and should not be represented as supported by the current OAuth App flow.

The Jira flow uses Atlassian 3LO and requests `offline_access` so refresh-token rotation can keep the connection alive. Atlassian refresh tokens rotate; every successful refresh must persist the newly returned refresh token. The current compare-and-swap write protects the stored pair from concurrent overwrite.

## Remaining live acceptance

These items cannot be proven by repository-only CI and require registered provider applications:

1. Configure the two provider apps with the exact deployed callback URLs and secrets.
2. Run a real GitHub connect → account verification → target selection → test → push/pull → refresh → revoke journey against a dedicated test repository.
3. Run the equivalent Jira Cloud journey against a dedicated test site/project.
4. Verify refresh after expiry, revoked consent, provider outage, repeated callback, state replay, user session change and organization membership change.
5. If a user has access to multiple Jira Cloud sites, expose a human site picker. Current callback selects the first accessible site; do not treat multi-site selection as complete.
6. Webhook registration remains a separate setup flow; existing signed webhook ingestion is not proof that provider webhooks have been registered.

No client secret, access token or refresh token belongs in Git. Do not use production credentials in CI fixtures.
