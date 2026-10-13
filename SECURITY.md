# Security

## Reporting a vulnerability

Email the maintainer (see `package.json` or the repository owner) with:

- a description of the issue and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- the affected version or commit.

Don't open a public issue for anything exploitable. You will get an acknowledgement within a few working days.

## Supported versions

The latest `main` is the only supported version.

## What's in place

- **Sign-in:** email and password only. Passwords are hashed with PBKDF2-SHA512 (210,000 iterations) and rate limited at sign-in, per client and per account, with an identical error for "no such account" and "wrong password". Self-service "forgot password" issues a single-use, 1-hour token (only its SHA-256 is stored) and never changes an account's role. Sessions are HS256 JWTs in an httpOnly, `SameSite=Lax` cookie (`Secure` in production). A `sessionVersion` claim means suspending, disabling, or deleting a user, a self-service password reset, or an admin resetting their password, ends every existing session immediately. A server-side route gate (`src/proxy.ts`) rejects unauthenticated requests before any page or API code runs.
- **Access tokens:** personal tokens for the MCP server and chat bots are random 256-bit values. Only a SHA-256 hash is stored. Tokens can expire and can be revoked. The proxy confines them to an allow-list of planning-data endpoints (tasks, calendar, projects, runs, notifications, search, and similar). A token can't reach password, account, backup, settings, team, or admin routes, and it can't create, list, or revoke tokens.
- **Notebook content** is sanitized (an allow-list DOMPurify configuration, on the server and the client) before it reaches `dangerouslySetInnerHTML` or the PDF renderer.
- **Uploads:** only PNG, JPEG, GIF, and WebP images (plus PDFs as notebook attachments). Each file is checked by its magic bytes, size-capped, stored outside the web root, and served through an authenticated route with access checks and `X-Content-Type-Options: nosniff`.
- **PDF export** runs Chromium with all network requests blocked and JavaScript disabled.
- **Rate limiting** applies to password sign-in, sign-up, forgot/reset-password, setting a password, creating access tokens, uploads and attachments, PDF export, invite redemption, chat, search, and local dictation transcription.
- **HTTP headers:** Content Security Policy, HSTS (production), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy, and Permissions-Policy. `X-Powered-By` is disabled.
- **Admin actions** (creating, changing, and deleting users) are written to an append-only audit log at `${RUNE_DATA_DIR}/audit.log`.
- **Secrets:** `.env` is git-ignored. `src/lib/env.ts` refuses to start a production deployment that is missing `JWT_SECRET` (at least 32 characters, and not a well-known value) or `DATABASE_URL`.
- **Built-in developer account:** in production it is created only when `RUNE_DEVELOPER_PASSWORD` is set to a strong password, sign-in with the public development default is refused, and its password-reset links are never emailed (the address is a placeholder). See the administrator guide §1c.
- **Sessions:** changing or resetting a password signs out every other session (the session version is bumped and checked on every request). Deleting an account requires the current password and revokes its sessions immediately.
- **Client addresses:** IP-based rate limits use the `X-Forwarded-For` entry written by the nearest trusted proxy (`RUNE_TRUSTED_PROXY_HOPS`), so a client can't pick a fresh identity per request. Sign-in, recovery and sign-up also have per-account limits.
- **Backup restore:** every cross-record link in an uploaded backup (projects, teams, tasks, runs, instruments, authors) is re-checked with the same rules as the live API before any data is replaced.
- **Local dictation:** when the browser has no built-in speech recognition, audio is transcribed on the server by a local Whisper model (transformers.js) and never sent to a third party.
- **Checks in CI:** type checking, unit and route tests, a production build, a dependency audit that fails on high or critical advisories in runtime dependencies, lint, and end-to-end tests with automated accessibility scans.

## Known follow-ups

- The rate-limit store is per process. A deployment with several instances should put a shared store in front of it.
- Signing out clears this browser's cookie only. Sessions are stateless 7-day tokens, so a stolen cookie stays valid until it expires, the password is changed, or an admin suspends the account. Per-session revocation would need a server-side session list.
- If the database is unreachable when a session is checked, the check fails open for up to 30 seconds (an outage shouldn't sign everyone out); suspension and deletion take effect once the database answers again.
- Rune exposed directly to the internet, with no reverse proxy, can't tell a forged `X-Forwarded-For` from a real one; deploy behind a proxy. Per-account limits still apply.
