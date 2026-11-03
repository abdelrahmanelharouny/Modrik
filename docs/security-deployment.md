# Modrik deployment security

## Identity, sessions, and organization access

The Next.js 16 `src/proxy.ts` gate protects application APIs and pages by default. Public API exemptions are method-specific:

- `POST /api/auth/login`
- `POST /api/auth/invitations/accept`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/complete`
- `POST /api/auth/logout`
- `GET|HEAD /api/auth/session`
- `GET|POST /api/study/respond` — participant-scoped bearer-token endpoint.

The owner bootstrap credentials establish the initial administrator identity; they are not a substitute for organization membership. Organization and project operations resolve the authenticated identity, active membership, organization state, project ownership, and method-specific permission. Unknown API routes fail closed. Caller-supplied `x-modrik-*` identity headers are stripped and rebuilt only by the trusted proxy.

If authentication is not configured, protected APIs return `503 AUTH_NOT_CONFIGURED`; they do not silently become public.

Required secrets (never commit them):

- `MODRIK_ADMIN_EMAIL` — bootstrap owner email.
- `MODRIK_ADMIN_PASSWORD_HASH` — supported scrypt password hash.
- `MODRIK_AUTH_SECRET` — at least 32 random bytes for signed sessions.
- `MODRIK_ENCRYPTION_KEY` — independent 32-byte AES-256-GCM key for stored integration credentials.

Generate the owner password hash interactively:

```bash
bun scripts/hash-admin-password.mjs
```

The script disables terminal echo, asks for the password twice, enforces the configured minimum, and prints the hash. Do not pass a password in a shell command or commit the hash.

Generate independent keys:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one value for `MODRIK_AUTH_SECRET` and the other for `MODRIK_ENCRYPTION_KEY`. Back up the encryption key securely: losing it makes encrypted integration credentials unrecoverable. A guarded local credential re-encryption utility is available: set distinct `MODRIK_ENCRYPTION_KEY_OLD` and `MODRIK_ENCRYPTION_KEY_NEW` values, run `bun run secrets:rotate` for a read-only dry run, take and verify a database backup, then run `bun run secrets:rotate:apply` in a maintenance window. The operation uses compare-and-swap updates inside a transaction, preserves unrelated config fields, supports legacy plaintext rows, and is idempotent for records already encrypted with the new key. Retain the old key until a restore/rollback rehearsal and post-rotation credential checks pass. This re-encrypts stored integration tokens; it does not rotate provider-side GitHub/Jira credentials or implement OAuth. Run the utility only after the dependency-backed test suite and a staging rehearsal pass.

## Invitations and password recovery

- Invitation tokens are random, single-use, expiring bearer secrets; only their SHA-256 digests are persisted. Owner/admin membership permissions govern issuance and revocation. The raw invitation URL is returned once for manual delivery; this release does not claim that invitation email has been sent.
- Password-reset tokens are random, single-use and time-limited; only hashes are persisted. Successful reset revokes active sessions and other outstanding reset tokens.
- Recovery email uses Resend. Configure `RESEND_API_KEY`, `PASSWORD_RESET_EMAIL_FROM`, and a trusted HTTPS `APP_URL`; without these, recovery delivery is not production-ready. Public responses are enumeration-resistant.

## Distributed rate limiting

Authentication, invitation and recovery mutation endpoints use the shared Upstash Redis REST limiter with an atomic fixed-window operation. Production fails closed when Redis configuration is missing or the shared limiter is unavailable. Configure:

- `UPSTASH_REDIS_REST_URL` — HTTPS REST endpoint.
- `UPSTASH_REDIS_REST_TOKEN` — secret bearer token.

The in-process fallback is restricted to development/test and is not a multi-instance production guarantee. Verify the real Redis endpoint from the deployed runtime; CI uses placeholders and does not prove provider connectivity.

## Integration credentials

Saved GitHub/Jira credentials are encrypted at rest using AES-256-GCM. Legacy plaintext values remain readable for compatibility and should be re-saved after encryption is configured. OAuth authorization flows and provider-side token lifecycle automation are not implemented. A guarded operator-run re-encryption utility exists for stored credentials, but it is not an automatic rotation service. Treat static-token integration as the current capability; do not advertise OAuth or provider-side automatic rotation as supported.

The Jira connector validates allowed HTTPS origins and does not follow redirects. Private Jira Data Center deployments must additionally assess DNS/IP egress controls; hostname allowlisting alone is not a complete network-layer SSRF defense.

## Database migration release gate

SQLite is the canonical development schema; PostgreSQL schema is generated and parity-checked. The repository inventory fingerprints describe checked-in schemas only; they do not prove equivalence with a deployed database. There is no committed production baseline because deployed database history has not been reconciled. Do not run `prisma migrate deploy` against an existing environment until backups have been restored in a rehearsal, the provider-specific baseline is reviewed, and the migration history is reconciled. See [database-migrations.md](database-migrations.md).

## Operational checklist

1. Configure all required secrets and run `bun run security:release-check` in the deployment environment.
2. Verify Redis connectivity and Resend sender/domain verification using real provider credentials.
3. Verify HTTPS, secure cookies, and the canonical `APP_URL`.
4. Verify unauthenticated protected APIs return `401`, while missing auth configuration returns `503`.
5. Verify invitation tokens expire, are single-use, and cannot grant owner membership.
6. Verify password-reset responses do not reveal account existence and successful resets revoke sessions.
7. Verify cross-organization and cross-project access is denied for every role and HTTP method.
8. Test a full database backup restore before approving a production migration baseline.
9. Re-save legacy plaintext integration credentials; use the guarded stored-secret re-encryption utility only after backup, staging rehearsal and rollback verification.
10. Do not describe technical self-audit output as legal certification. Unmeasured controls remain `not-assessed`.
