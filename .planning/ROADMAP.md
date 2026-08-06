# Roadmap: KickoffAI Backend

## Overview

Build an internal AI chat backend for Kickoff Africa in four sequential phases: establish secure magic-link authentication, enforce time-based access control, deliver Claude-powered chat with automatic model routing, and expose an admin panel for full org visibility and governance. Each phase gates the next — chat cannot exist without access control, and access control cannot exist without identity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Authentication** - Org members can securely identify themselves via magic link ✓ 2026-08-06
- [x] **Phase 2: Access Control** - AI usage is metered per 12-hour window with admin override capability ✓ 2026-08-06
- [x] **Phase 3: Chat** - Users can have full AI-assisted conversations with automatic model routing ✓ 2026-08-06
- [ ] **Phase 4: Admin** - Admins have complete visibility into users, chats, and access requests

## Phase Details

### Phase 1: Authentication
**Goal**: Org members can securely identify themselves via magic link with no password
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. User can request a magic link by submitting their org email and receive it at that address
  2. User can click the magic link and receive a valid JWT that authenticates subsequent requests
  3. User's JWT remains valid across multiple requests without re-authenticating
  4. User can log out and their token is rejected on further requests
  5. The `work@kickoff.africa` account exists as admin automatically on first server startup
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffold, database connection, and full v1 schema migration
- [ ] 01-02-PLAN.md — Magic link auth flow, JWT sessions, auth middleware, logout, admin seed

### Phase 2: Access Control
**Goal**: AI usage is metered per rolling 12-hour window; users can request and admins can grant extensions
**Depends on**: Phase 1
**Requirements**: ACCS-01, ACCS-02, ACCS-03, ACCS-04, ACCS-05, ACCS-06
**Success Criteria** (what must be TRUE):
  1. Authenticated user has exactly 1 hour of AI access tracked cumulatively in each 12-hour rolling window
  2. User can query the API and see their remaining time in the current window
  3. Chat requests are blocked with a clear error when the user's time is exhausted
  4. User can submit an extension request for +1, +2, or +3 additional hours
  5. Admin can approve or deny a pending extension request; approved requests add the granted time immediately
**Plans:** 2 plans

Plans:
- [ ] 02-01-PLAN.md — Migration, access service, status endpoint, and chat gating middleware
- [ ] 02-02-PLAN.md — Extension request submission, admin approve/deny endpoints, requireAdmin middleware

### Phase 3: Chat
**Goal**: Users can have AI-assisted conversations with Claude, with each message routed to the cheapest appropriate model
**Depends on**: Phase 2
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05
**Success Criteria** (what must be TRUE):
  1. User can create a new conversation and receive a conversation ID
  2. User can send a message and receive a complete (non-streamed) Claude response within that conversation
  3. Each message is classified by Claude Haiku and routed to Haiku, Sonnet, or Opus based on complexity
  4. User can list all their past conversations with title and last message timestamp
  5. User can retrieve the full message history of any specific conversation
**Plans:** 2 plans

Plans:
- [ ] 03-01-PLAN.md — Anthropic SDK setup, conversation CRUD endpoints (create, list, get with history)
- [ ] 03-02-PLAN.md — Claude service (classify + route + chat), message send endpoint with full pipeline

### Phase 4: Admin
**Goal**: Admins have full visibility into all users, all conversations, and all access requests, with role management
**Depends on**: Phase 3
**Requirements**: ADMN-01, ADMN-02, ADMN-03, ADMN-04
**Success Criteria** (what must be TRUE):
  1. Admin can retrieve a list of all users with their usage statistics (time used, requests made, window reset time)
  2. Admin can view all conversations and the full message history for any user
  3. Admin can view all access extension requests with their current status (pending, approved, denied)
  4. Admin can promote any existing user to admin role
**Plans:** 1 plan

Plans:
- [ ] 04-01-PLAN.md — Admin router with user stats, conversation visibility, extension request list, role promotion

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Authentication | 2/2 | ✓ Complete | 2026-08-06 |
| 2. Access Control | 2/2 | ✓ Complete | 2026-08-06 |
| 3. Chat | 2/2 | ✓ Complete | 2026-08-06 |
| 4. Admin | 0/1 | Not started | - |
