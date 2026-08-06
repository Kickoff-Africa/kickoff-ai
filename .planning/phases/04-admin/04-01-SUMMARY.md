---
phase: 04-admin
plan: 01
subsystem: api
tags: [express, postgres, admin, rbac, typescript]

# Dependency graph
requires:
  - phase: 03-ai-routing
    provides: conversations and messages tables; messagesRouter pattern
  - phase: 02-access-control
    provides: access_windows, access_extension_requests tables; requireAdmin middleware
provides:
  - Admin router with 5 endpoints covering user stats, conversation visibility, extension governance, and role promotion
  - GET /admin/users — all users with current-window usage statistics via LEFT JOIN LATERAL
  - GET /admin/users/:userId/conversations — all conversations for any user (no ownership check)
  - GET /admin/conversations/:conversationId/messages — full conversation + messages for any conversation
  - GET /admin/extensions — all extension requests with optional ?status= filter
  - PATCH /admin/users/:userId/promote — promotes user to admin with self-promotion guard
affects: [frontend-admin-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [router-level middleware (adminRouter.use) for blanket auth+authz on all routes, LEFT JOIN LATERAL for latest-window usage stats]

key-files:
  created: [src/routes/admin.ts]
  modified: [src/index.ts]

key-decisions:
  - "Router-level middleware: adminRouter.use(authenticate, requireAdmin) applies auth+authz to every route without repeating per-handler"
  - "LEFT JOIN LATERAL for current window: efficiently gets most recent access_window per user in a single query"
  - "Admin extension endpoint uses ?status= query param with NULL passthrough so missing param returns all statuses"
  - "Self-promotion guard: PATCH /promote blocks req.user.id === userId with 400 before DB update"

patterns-established:
  - "Admin bypass: no ownership WHERE clause — admin routes omit the user_id = $N guard present in user-facing routes"
  - "Router middleware pattern: use adminRouter.use() for blanket middleware instead of per-route middleware arrays"

# Metrics
duration: 1min
completed: 2026-08-06
---

# Phase 4 Plan 1: Admin Router Summary

**Five admin endpoints providing full user governance: usage stats via LEFT JOIN LATERAL, unrestricted conversation/message access, extension request list with status filter, and role promotion with self-guard**

## Performance

- **Duration:** 1 min
- **Started:** 2026-08-06T21:23:04Z
- **Completed:** 2026-08-06T21:24:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Admin router with all 5 required endpoints, gated via router-level `adminRouter.use(authenticate, requireAdmin)` — zero per-route repetition
- Current-window usage statistics via LEFT JOIN LATERAL query (most recent window within last 12 hours per user)
- Admin bypass pattern: conversation and message endpoints omit ownership checks, enabling full visibility across all users
- Extension request list with NULL-passthrough `?status=` filter (missing param returns all statuses)
- Self-promotion guard: PATCH /promote returns 400 when admin attempts to promote themselves

## Task Commits

Each task was committed atomically:

1. **Task 1: Create admin router with all 5 endpoints** - `7801e84` (feat)
2. **Task 2: Mount admin router in index.ts** - `f1cc9e2` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/routes/admin.ts` - Admin router with 5 endpoints, all gated by authenticate + requireAdmin
- `src/index.ts` - Added adminRouter import and `app.use('/admin', adminRouter)` mount

## Decisions Made

- Router-level middleware via `adminRouter.use(authenticate, requireAdmin)` instead of per-handler arrays — cleaner and eliminates risk of forgetting auth on a future route
- LEFT JOIN LATERAL for current window lookup: efficient single query rather than N+1 per user
- Status filter uses `$1::text IS NULL OR r.status = $1` pattern — single parameterized query handles both filtered and unfiltered cases
- Self-promotion guard checks before DB update to give a clear 400 rather than a no-op

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 5 admin endpoints are live and TypeScript-clean
- adminRouter mounted at `/admin` in index.ts
- Ready for any admin UI frontend (Phase 4 continuation or frontend work)
- No blockers

---
*Phase: 04-admin*
*Completed: 2026-08-06*
