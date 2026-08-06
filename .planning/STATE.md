# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-06)

**Core value:** Org members can have productive AI-assisted conversations within a controlled, auditable system where admins govern access and costs stay optimized.
**Current focus:** Phase 4 — Admin UI

## Current Position

Phase: 4 of 4 (Admin) — In progress
Plan: 1 of ? in Phase 4 — In progress
Status: In progress
Last activity: 2026-08-06 — Completed 04-01-PLAN.md (Admin router with 5 endpoints)

Progress: [█████████░] 87%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: ~10 min
- Total execution time: ~51 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-authentication | 2/2 | ~25 min | ~12 min |
| 02-access-control | 2/2 | ~24 min | ~12 min |
| 03-ai-routing | 2/2 | ~13 min | ~6 min |
| 04-admin-ui | 0/? | — | — |

**Recent Trend:**
- Last 5 plans: 01-02 (~15 min), 02-01 (~12 min), 02-02 (~12 min), 03-01 (~11 min), 03-02 (~2 min)
- Trend: Accelerating as codebase matures

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Setup: TypeScript + Express + PostgreSQL — no alternatives considered, chosen by preference
- Auth: Magic link only, no passwords; JWT for session persistence
- Routing: Haiku classifies complexity, routes to Haiku/Sonnet/Opus
- Access: 1-hour free per 12-hour rolling window; admins grant +1/+2/+3 hour extensions
- Bootstrap: `work@kickoff.africa` seeded as admin on first startup from env
- Tooling: tsx (not ts-node) required for TypeScript 7 compatibility
- Access windows: getOrCreateWindow uses 12-hour rolling window; extension stored as seconds in extension_seconds column
- Admin gating: requireAdmin middleware is composable — always used after authenticate in route chains
- Approve override: POST /:id/approve accepts its own `hours` body param (admin can grant different hours than requested)
- Anthropic SDK: @anthropic-ai/sdk installed; config.anthropicApiKey exports the key via requireEnv
- Conversations: ownership always verified with `WHERE id = $1 AND user_id = $2` before message access
- Models: claude-haiku-4-5-20251001 (classify + simple), claude-sonnet-4-6 (moderate), claude-opus-4-6 (complex)
- Auto-title: set once from first message content (truncated to 50 chars); never re-titled
- Usage tracking: wall-clock seconds of each request tracked via addUsage() after response prepared
- messagesRouter mounted at /conversations; route is /:conversationId/messages with mergeParams: true
- Admin routing: adminRouter.use(authenticate, requireAdmin) pattern — router-level blanket auth+authz
- Admin bypass: admin routes omit ownership WHERE clause; LEFT JOIN LATERAL for current-window usage stats per user

### Pending Todos

None.

### Blockers/Concerns

- ts-node@10.x is incompatible with TypeScript@7.x — all script runners must use `tsx` (resolved, tsx in use)

## Session Continuity

Last session: 2026-08-06T21:24:16Z
Stopped at: Completed 04-01-PLAN.md (Admin router — 5 endpoints, all gated by authenticate + requireAdmin)
Resume file: None
