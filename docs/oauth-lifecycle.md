# OAuth lifecycle foundation

OAuth provider activation is intentionally deferred until deployment credentials and provider registrations are ready. This change establishes the secure authorization boundary without making any live provider connection.

## Implemented
- Authenticated, organization-scoped OAuth start route for GitHub and Jira Cloud.
- Project-update permission check on start and callback.
- Signed, provider-bound, project/user/organization-bound state with a 10-minute expiry and constant-time comparisons.
- PKCE S256 challenge/verifier.
- HttpOnly, SameSite=Lax, Secure-in-production transaction cookie scoped to the callback path; cookie cleared on success and failure.
- No-store and no-referrer response headers.
- GitHub account verification and Atlassian identity + accessible Jira Cloud site verification.
- Access and refresh token encryption at rest using the existing AES-256-GCM secret box.
- Pending OAuth connections appear in the existing masked integration status but are not loadable by sync adapters until a human selects a target.
- Static-token integration behavior remains supported.

## Routes
- GET /api/projects/:id/integrations/oauth/github
- GET /api/projects/:id/integrations/oauth/jira
- GET /api/integrations/oauth/github/callback
- GET /api/integrations/oauth/jira/callback

## Activation variables
- MODRIK_APP_URL (canonical HTTPS origin)
- MODRIK_GITHUB_CLIENT_ID and MODRIK_GITHUB_CLIENT_SECRET
- MODRIK_ATLASSIAN_CLIENT_ID and MODRIK_ATLASSIAN_CLIENT_SECRET
- MODRIK_AUTH_SECRET (at least 32 bytes)
- MODRIK_ENCRYPTION_KEY (32-byte base64 or 64-character hex)

Register exact callback URLs under /api/integrations/oauth/{github|jira}/callback.

## Deferred before production activation
- Repository and Jira-project selection UI/API.
- OAuth-backed tracker adapter activation after target selection.
- Provider-specific access-token refresh and refresh-token rotation.
- Explicit provider revocation/disconnect and reauthorization UX.
- Webhook registration and live provider health checks.
- Live end-to-end tests using dedicated provider test applications.

GitHub and Atlassian token lifecycles differ. Never assume one provider's refresh semantics apply to the other. No client secret or provider token is committed to this repository.
