# Summary: 03-01 SDK + Conversation CRUD

**Status:** Complete
**Completed:** 2026-08-06
**Commits:** 15ab8a7, f14e0c3

## What Was Built

Installed the Anthropic SDK (@anthropic-ai/sdk v0.115.0) and wired its API key into the typed env config via `requireEnv('ANTHROPIC_API_KEY')`. Created all three conversation CRUD endpoints — POST to create, GET / to list with last_message_at subquery, and GET /:id to fetch a conversation with its full ordered messages array. Mounted the new router at `/conversations` in the Express app.

## Files Created/Modified

| File | Action |
|------|--------|
| `package.json` | Added @anthropic-ai/sdk dependency |
| `package-lock.json` | Updated lockfile |
| `.env.example` | Added ANTHROPIC_API_KEY entry |
| `src/config/env.ts` | Added `anthropicApiKey: requireEnv('ANTHROPIC_API_KEY')` |
| `src/routes/conversations.ts` | Created — POST /, GET /, GET /:id |
| `src/index.ts` | Import and mount conversationsRouter at /conversations |

## Deviations

None — plan executed exactly as written.

## Notes for Plan 03-02

- `config.anthropicApiKey` is available from `src/config/env.ts` — use it when constructing the `Anthropic` client
- Conversations table has `updated_at` column — plan 03-02 should UPDATE it when new messages are saved so the GET / list stays correctly ordered
- The GET /:id endpoint ownership check (`WHERE id = $1 AND user_id = $2`) can be reused in 03-02 before saving messages to a conversation
- `model_used` column in messages is populated by 03-02 when the AI router selects Haiku/Sonnet/Opus
