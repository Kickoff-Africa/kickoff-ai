# KickoffAI Backend

Internal AI chat backend for Kickoff Africa — org-only ChatGPT alternative powered by Claude.

## What It Does

- Magic link login via org email
- 1-hour free AI access per 12-hour rolling window
- Auto-routes messages to cheapest Claude model (Haiku → Sonnet → Opus)
- Admins can view all chat history and grant extended access
- Full access request and approval workflow

## Stack

- TypeScript + Express
- PostgreSQL
- Anthropic Claude API

## Planning

See [`.planning/`](.planning/) for project context, requirements, and roadmap.

**Next step:** `/gsd:plan-phase 1` — Authentication
