# Summary: 02-01 Access Control Foundation

**Status:** Complete
**Completed:** 2026-08-06
**Commits:** 83bf67a, a75edff

## What Was Built

- `src/db/migrations/002_add_extension_seconds.sql` — Adds `extension_seconds INTEGER NOT NULL DEFAULT 0` column to `access_windows` table via `ADD COLUMN IF NOT EXISTS`
- `src/services/access.ts` — Core access-window service with:
  - `getOrCreateWindow(userId)` — Finds active window within last 12 hours or creates a new one
  - `getRemainingSeconds(userId)` — Returns secondsUsed, totalAllowed (3600 + extensions), secondsRemaining, windowStart, windowExpiresAt
  - `addUsage(userId, seconds)` — Increments seconds_used on active window
  - `addExtensionToWindow(userId, extraSeconds)` — Increments extension_seconds on active window
- `src/routes/access.ts` — `GET /access/status` (authenticated) returning snake_case JSON of window status
- `src/middleware/checkAccess.ts` — Middleware that blocks requests with 429 when secondsRemaining <= 0; does NOT deduct time (Phase 3 responsibility)
- `src/index.ts` — Mounts `accessRouter` at `/access`

## Files Created/Modified

| File | Action |
|------|--------|
| `src/db/migrations/002_add_extension_seconds.sql` | Created |
| `src/services/access.ts` | Created |
| `src/routes/access.ts` | Created |
| `src/middleware/checkAccess.ts` | Created |
| `src/index.ts` | Modified (added accessRouter import and mount) |

## Deviations

None — plan executed exactly as written.

## Notes for Plan 02-02

- `checkAccess` middleware is ready to compose with any route that needs time-gating; import from `../middleware/checkAccess`
- `addUsage(userId, seconds)` is the Phase 3 hook for deducting chat time — call it after a successful AI response with actual token time consumed
- `addExtensionToWindow(userId, extraSeconds)` is the hook for admin extension approval — takes extra seconds (not hours)
- The migration runner (`src/db/migrate.ts`) is idempotent and will pick up `002_add_extension_seconds.sql` automatically on next startup
- `access_extension_requests` table already exists in `001_initial_schema.sql` — Plan 02-02 (admin extension flow) can use it directly
