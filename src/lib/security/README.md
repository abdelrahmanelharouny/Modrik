# Security primitives

Small runtime primitives live here so they can be exercised with Node's built-in test runner without requiring a database or external service.

- `session.mjs`: scrypt credential verification and signed owner-session tokens.
- `secret-box.mjs`: AES-256-GCM envelope for tracker credentials.
- `jira-url.mjs`: Jira origin allowlist and redirect-safe URL construction.

Keep these primitives pure. Resource-level project authorization belongs in route/service boundaries and must not be inferred from an authenticated session alone.
