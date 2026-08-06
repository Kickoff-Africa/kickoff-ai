---
phase: 01-authentication
plan: 02
subsystem: auth
tags: [jwt, magic-link, nodemailer, express, postgresql, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: Express server scaffold, PostgreSQL connection, users/magic_link_tokens/user_sessions schema
provides:
  - Magic link token generation (crypto.randomBytes 32-byte hex)
  - Email service via nodemailer SMTP (dev: logs to console)
  - POST /auth/request-magic-link — find-or-create user, generate token, send email
  - GET /auth/verify?token — validate magic token, issue JWT, create session
  - GET /auth/me — protected endpoint returning current user (AUTH-03)
  - POST /auth/logout — revokes session by setting revoked_at on user_sessions row
  - authenticate middleware — Bearer JWT validation + live session revocation check in DB
  - Admin auto-seed on startup (work@kickoff.africa, role=admin, idempotent)
affects: [02-access-control, 03-chat, 04-admin]

# Tech tracking
tech-stack:
  added: [nodemailer, @types/nodemailer, uuid, @types/uuid, jsonwebtoken, @types/jsonwebtoken]
  patterns: [magic-link-auth, jwt-sessions, session-revocation-via-jti, find-or-create-user, bearer-token-middleware]

key-files:
  created:
    - src/services/token.ts
    - src/services/email.ts
    - src/routes/auth.ts
    - src/middleware/authenticate.ts
  modified:
    - src/index.ts

key-decisions:
  - "Magic link tokens stored in DB; verified by lookup + used_at + expires_at"
  - "JWT jti mapped to user_sessions row for per-session revocation"
  - "tsx required instead of ts-node (TypeScript 7 incompatibility)"
  - "Admin seed embedded inline in src/index.ts startup — no separate seed.ts file"
  - "Dev mode logs magic link URL to console, SMTP not required for development"

patterns-established:
  - "authenticate middleware: import from src/middleware/authenticate.ts to protect any route"
  - "Session revocation: UPDATE user_sessions SET revoked_at = NOW() WHERE jwt_jti = $1"
  - "Find-or-create user: INSERT ... ON CONFLICT (email) DO UPDATE SET updated_at = NOW() RETURNING *"

# Metrics
duration: ~15min
completed: 2026-08-06
---

# Phase 1 Plan 02: Magic Link Auth Flow Summary

**Magic link auth with JWT session tracking, per-session revocation via jti, nodemailer email delivery, and admin auto-seed on startup**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-06
- **Completed:** 2026-08-06
- **Tasks:** 2 (1 auto + 1 human-verify checkpoint)
- **Files modified:** 5

## Accomplishments

- Complete magic link auth flow covering AUTH-01 through AUTH-05
- JWT sessions with per-session revocation (jti stored in user_sessions, checked on every request)
- Admin user work@kickoff.africa auto-seeded idempotently on every server startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Token services, email service, auth routes** - `e770cbf` (feat)
2. **Task 2: Human verify checkpoint** - APPROVED by user (no commit)

**Plan metadata:** (docs commit after summary creation)

## Files Created/Modified

- `src/services/token.ts` - generateMagicToken(), createJWT(), verifyJWT() using jsonwebtoken
- `src/services/email.ts` - nodemailer SMTP transport; logs magic link URL to console in dev
- `src/routes/auth.ts` - authRouter: request-magic-link, verify, me, logout
- `src/middleware/authenticate.ts` - Bearer JWT validation, session revocation check, Express Request type extension
- `src/index.ts` - Mounts authRouter at /auth, seeds admin user on startup

## Decisions Made

- JWT jti stored in user_sessions enables per-session revocation without token blacklist scanning
- Inline admin seed in src/index.ts keeps startup simple — avoids a separate seed file
- Dev mode console logging means SMTP credentials are not required during local development
- tsx used in place of ts-node for TypeScript 7 compatibility (ts-node@10.x incompatible)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- ts-node@10.x is incompatible with TypeScript@7.x — all script execution uses tsx instead. This was already identified and recorded in STATE.md during Plan 01-01.

## User Setup Required

External SMTP configuration is required for production email delivery. See environment variables:

- `SMTP_HOST` — e.g. smtp.gmail.com or email-smtp.region.amazonaws.com
- `SMTP_PORT` — 587 (TLS) or 465 (SSL)
- `SMTP_USER` — SMTP username or email address
- `SMTP_PASS` — SMTP password or app-specific password

In development, magic link URLs are logged to the console — SMTP is not required.

## Next Phase Readiness

- Auth layer is complete and verified end-to-end
- Import `authenticate` from `src/middleware/authenticate.ts` to protect any route in Phase 2 (access control) or beyond
- `req.user` provides `{ id, email, role, jti }` on authenticated requests
- No blockers for Phase 2

---
*Phase: 01-authentication*
*Completed: 2026-08-06*
