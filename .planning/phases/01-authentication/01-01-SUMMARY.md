# Summary: 01-01 Project Scaffold and DB Schema

**Status:** Complete
**Completed:** 2026-08-06
**Duration:** ~10 minutes
**Commits:** bd333f4, d5aa8ee

## What Was Built

- Full TypeScript + Express project scaffold with strict mode compilation
- Typed environment config (`src/config/env.ts`) that validates required vars at startup
- Express server (`src/index.ts`) with `/health` endpoint and PostgreSQL connection check
- PostgreSQL connection pool (`src/config/database.ts`) with `query()` helper
- Idempotent migration runner (`src/db/migrate.ts`) with `_migrations` tracking table
- Complete v1 database schema in `001_initial_schema.sql` — all 7 user-facing tables plus indexes
- Admin seeder (`src/db/seed.ts`) — inserts `ADMIN_EMAIL` user with role=admin, idempotent

## Files Created

- `package.json` — project manifest with build/dev/start/migrate/seed scripts
- `package-lock.json` — locked dependency tree
- `tsconfig.json` — TypeScript config (ES2020, commonjs, strict)
- `.gitignore` — excludes node_modules, dist, .env, *.js.map
- `.env.example` — documents all 11 required/optional environment variables
- `src/config/env.ts` — dotenv loader, validates DATABASE_URL, JWT_SECRET, ADMIN_EMAIL
- `src/config/database.ts` — pg Pool + query() helper
- `src/index.ts` — Express app, /health endpoint, startup DB check, exports app
- `src/db/migrate.ts` — reads sorted .sql files, tracks in _migrations, runs idempotently
- `src/db/migrations/001_initial_schema.sql` — 7 tables + pgcrypto + 8 indexes
- `src/db/seed.ts` — seeds admin user from ADMIN_EMAIL env

## Database Tables Created

1. `users` — email, role (user/admin)
2. `magic_link_tokens` — token, expires_at, used_at
3. `user_sessions` — jwt_jti, expires_at, revoked_at
4. `access_windows` — seconds_used per window_start
5. `access_extension_requests` — requested_hours, status, reviewed_by
6. `conversations` — user chat threads
7. `messages` — role, content, model_used, tokens_used

## Deviations

**[Rule 3 - Blocking] Replaced ts-node with tsx**

- **Found during:** Task 2 verification (running migration)
- **Issue:** ts-node@10.9.2 is incompatible with TypeScript@7.0.2 — throws TypeError on startup
- **Fix:** Added `tsx@^4.23.9` as dev dependency; updated all npm scripts from `ts-node` to `tsx`
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** d5aa8ee

## Next Plan Needs

Plan 01-02 (magic link auth + JWT) can rely on:
- `pool` and `query()` exported from `src/config/database.ts`
- `config` object from `src/config/env.ts` (includes jwtSecret, jwtExpiry, magicLinkExpiryMinutes, smtp, adminEmail)
- All tables exist and are migration-tracked — use `npm run migrate` before `npm run seed`
- Server runs with `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` in environment
- Use `tsx` (not `ts-node`) for any new script runner references
