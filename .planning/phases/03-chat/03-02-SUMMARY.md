# Phase 3 Plan 02: Claude Service + Message Endpoint Summary

**Status:** Complete
**Completed:** 2026-08-06
**Duration:** ~2 min
**Commits:** e6a9b55, ab1f511

## What Was Built

Two new modules complete the AI routing pipeline:

1. `src/services/claude.ts` — Anthropic SDK wrapper with three exports:
   - `classifyComplexity()` calls claude-haiku-4-5-20251001 to classify any user message as `simple`, `moderate`, or `complex` using a strict single-word prompt.
   - `getModelForComplexity()` maps complexity to the appropriate model (Haiku / Sonnet / Opus).
   - `chat()` sends the full conversation history to the chosen model and returns the assistant text plus total token count (input + output).

2. `src/routes/messages.ts` — `POST /conversations/:conversationId/messages` endpoint implementing the full pipeline:
   - Validates `content` is a non-empty string (400 if missing).
   - Verifies conversation ownership (404 if not owned by req.user).
   - Inserts the user message.
   - Loads full conversation history for context.
   - Classifies complexity and selects model.
   - Calls Claude with history.
   - Inserts assistant message with `model_used` and `tokens_used`.
   - Auto-titles the conversation from the first message if `title` is NULL (truncated to 50 chars + ellipsis).
   - Tracks elapsed wall-clock seconds via `addUsage()`.
   - Returns 201 with the assistant message row, `model_used`, and `tokens_used`.

3. `src/index.ts` updated to mount `messagesRouter` at `/conversations`.

## Requirements Covered

- **CHAT-01:** Claude API integration via `@anthropic-ai/sdk` — complete.
- **CHAT-02:** Complexity classification (Haiku classifies, routes to Haiku/Sonnet/Opus) — complete.
- **CHAT-03:** Message send pipeline with history context — complete.
- **CHAT-04:** Auto-titling conversations from first message — complete.
- **CHAT-05:** Usage tracking after each request via `addUsage()` — complete.

## Files Created/Modified

| File | Action |
|------|--------|
| `src/services/claude.ts` | Created |
| `src/routes/messages.ts` | Created |
| `src/index.ts` | Modified — added messagesRouter import and mount |

## Deviations

None — plan executed exactly as written.

## Notes for Phase 4

- The `messagesRouter` uses `Router({ mergeParams: true })` but is mounted at `/conversations` in index.ts with the route defined as `/:conversationId/messages`. This is a clean, conventional pattern.
- Model names used: `claude-haiku-4-5-20251001` (classification + simple), `claude-sonnet-4-6` (moderate), `claude-opus-4-6` (complex). Phase 4 admin UI may want to display these to users.
- Token counts are stored in the `tokens_used` column of `messages` for cost auditing.
- Auto-title is set once (when `title IS NULL`) — no re-titling on subsequent messages.
- The access gate (`checkAccess`) runs before any Claude calls, ensuring exhausted users get 429 immediately without burning tokens.
