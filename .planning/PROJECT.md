# KickoffAI Backend

## What This Is

An internal AI chat backend for Kickoff Africa — a private, org-only alternative to ChatGPT powered by Anthropic's Claude API. Employees log in with their org email via magic link, then get access to an AI assistant that automatically routes each question to the cheapest appropriate Claude model. Admins have full visibility into all user chats and control over usage time allocation.

## Core Value

Org members can have productive AI-assisted conversations within a controlled, auditable system where admins govern access and costs stay optimized.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can log in with org email via magic link (no password)
- [ ] User gets 1 hour of free AI access per 12-hour rolling window
- [ ] System blocks AI access when user's time is exhausted
- [ ] User can request extended access (1/2/3 hours) from an admin
- [ ] Admin can approve or deny access requests with a chosen duration
- [ ] User can chat with Claude and receive full (non-streamed) responses
- [ ] System auto-classifies question complexity and routes to cheapest appropriate Claude model
- [ ] All chat history is stored and accessible to both users and admins
- [ ] Admin can view chat histories for all users
- [ ] Admin can view all users and their usage stats
- [ ] Admin can promote any user to admin role
- [ ] Seed account (work@kickoff.africa) is created as admin on first startup

### Out of Scope

- OAuth / Google SSO — magic link covers auth for v1
- Real-time streaming responses — full response delivery for v1
- Multi-organization support — single org deployment for v1
- File/image attachments in chat — text-only for v1
- Custom system prompts per user — global defaults only for v1
- Billing or payment integration — provisioned via single Anthropic API key

## Context

- Organization: Kickoff Africa, internal tool
- API: Anthropic Claude API (single org API key provisioned by admin)
- Model routing strategy: Use Claude Haiku to classify complexity, then route to Haiku (simple), Sonnet (moderate), or Opus (complex)
- Access model: 1-hour free window resets every 12 hours; admins can grant +1, +2, or +3 bonus hours per request
- Admin bootstrap: `work@kickoff.africa` seeded on startup; subsequent admins promoted via admin panel
- Scale: Small initially (< 50 users), designed to grow to large scale without rearchitecting

## Constraints

- **Tech Stack**: TypeScript + Express + PostgreSQL — chosen by preference
- **Auth**: Magic link via org email only — no password storage, no OAuth in v1
- **API Key**: Single Anthropic API key in environment — not per-user
- **Responses**: No streaming — full responses only for v1
- **Scalability**: Design data models and session tracking to handle growth (index heavy-query columns, avoid in-memory state)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-classify complexity via Haiku | Cheapest classification step before routing; no user friction | — Pending |
| Magic link auth | No password management overhead; org emails serve as identity | — Pending |
| 12-hour rolling window (not calendar day) | Fairer to users who work late/early; avoids timezone issues | — Pending |
| Admin seeds from env at startup | Simple bootstrap without a separate admin setup flow | — Pending |
| PostgreSQL for all storage | Relational model fits users, sessions, messages, access grants well | — Pending |

---
*Last updated: 2026-08-06 after initialization*
