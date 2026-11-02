# Modrik deployment security

## Owner authentication

All `/api/*` routes are protected by the Next.js 16 `src/proxy.ts` gate except these exact paths:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET|POST /api/study/respond` — participant-scoped bearer-token endpoint; it does not expose moderator session listing or study exports.

Authentication fails closed. If required owner secrets are missing, protected APIs return `503 AUTH_NOT_CONFIGURED`; they do not silently become public.

Set these secrets in the deployment environment (never in Git):

- `MODRIK_ADMIN_EMAIL` — the single owner email.
- `MODRIK_ADMIN_PASSWORD_HASH` — scrypt hash generated below.
- `MODRIK_AUTH_SECRET` — at least 32 random bytes, used to sign session tokens.
- `MODRIK_ENCRYPTION_KEY` — a separate 32-byte key for integration credentials at rest.

Generate an owner password hash in an interactive terminal:

```bash
bun scripts/hash-admin-password.mjs
```

The script disables terminal echo, asks for the password twice, enforces 14 characters, and prints the value for `MODRIK_ADMIN_PASSWORD_HASH`. Do not paste the password into a shell command or commit the resulting hash.

Generate independent encryption and signing keys:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one value as `MODRIK_AUTH_SECRET` and the other as `MODRIK_ENCRYPTION_KEY`. Keep a secure backup of `MODRIK_ENCRYPTION_KEY`: losing it makes already encrypted integration credentials unrecoverable.

The owner session is an eight-hour HMAC-SHA256 signed cookie with `HttpOnly`, `SameSite=Strict`, and `Secure` in production. Password verification uses bounded scrypt parameters and constant-time comparisons. The login endpoint has a per-process attempt limiter; multi-instance deployments should also configure an ingress/WAF rate limit because in-memory counters are not shared between instances.

## Integration credentials

Integration tokens are encrypted with AES-256-GCM before being stored. Old plaintext rows remain readable for migration compatibility, but the self-audit marks them as warnings. After setting `MODRIK_ENCRYPTION_KEY`, re-save each legacy integration configuration to replace its plaintext token with authenticated ciphertext.

The Jira connector accepts Atlassian Cloud tenants or exact HTTPS origins listed in `MODRIK_JIRA_ALLOWED_ORIGINS`. Redirects are not followed for Jira requests. Deployments using a private Jira Data Center host must explicitly assess outbound network access and DNS/IP egress policy; hostname allowlisting alone is not a complete network-layer SSRF control.

## Participant study endpoint

The moderator study API (`/api/study`) is owner-authenticated. Participant actions use the issued one-time bearer token against `/api/study/respond`. The token is stored hashed, expires, is scoped to one study session, and is not returned by moderator listing/export endpoints.

## Operational checklist

1. Configure all four secrets above before publishing the deployment.
2. Use HTTPS and keep `NODE_ENV=production`.
3. Configure an edge/WAF rate limit for `/api/auth/login` and `/api/study/respond`.
4. Verify that unauthenticated requests to `/api/projects` return `401`, and that requests with no auth configuration return `503`.
5. Verify that `/api/study/respond` rejects missing/expired tokens and cannot access other participants' sessions.
6. Re-save any integration configuration created before encryption was enabled.
7. Do not describe the self-audit as legal certification. It reports technical evidence and explicitly marks unmeasured controls `not-assessed`.
