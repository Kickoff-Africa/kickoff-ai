# Requirements: KickoffAI Backend

**Defined:** 2026-08-06
**Core Value:** Org members can have productive AI-assisted conversations within a controlled, auditable system where admins govern access and costs stay optimized.

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can request a magic link sent to their org email address
- [x] **AUTH-02**: User can authenticate by clicking the magic link and receive a JWT
- [x] **AUTH-03**: User JWT session persists across requests without requiring re-login
- [x] **AUTH-04**: User can log out and have their token invalidated
- [x] **AUTH-05**: System seeds `work@kickoff.africa` as the admin account on first startup

### Access Control

- [x] **ACCS-01**: User has 1 hour of free AI access per 12-hour rolling window (tracked cumulatively)
- [x] **ACCS-02**: User can query their remaining time for the current 12-hour window
- [x] **ACCS-03**: API blocks chat requests and returns a clear error when user's time is exhausted
- [x] **ACCS-04**: User can submit an extension request for +1, +2, or +3 additional hours
- [x] **ACCS-05**: Admin can approve an extension request by selecting the granted duration
- [x] **ACCS-06**: Admin can deny an extension request

### Chat

- [x] **CHAT-01**: User can create a new conversation (returns a conversation ID)
- [x] **CHAT-02**: User can send a message in a conversation and receive a full (non-streamed) Claude response
- [x] **CHAT-03**: System uses Claude Haiku to auto-classify message complexity, then routes to the cheapest appropriate model (Haiku → Sonnet → Opus)
- [x] **CHAT-04**: User can list all their past conversations (with title, last message timestamp)
- [x] **CHAT-05**: User can view the full message history of a specific conversation

### Admin

- [ ] **ADMN-01**: Admin can view all users with their usage statistics (time used, requests made, window resets)
- [ ] **ADMN-02**: Admin can view all conversations and messages for any user
- [ ] **ADMN-03**: Admin can view all access extension requests (pending, approved, denied)
- [ ] **ADMN-04**: Admin can promote any existing user to admin role

## v2 Requirements

### Chat Enhancements

- **CHAT-V2-01**: Responses stream in real-time via SSE (typing effect)
- **CHAT-V2-02**: User can attach files/images to messages

### Authentication

- **AUTH-V2-01**: OAuth login via Google Workspace (org SSO)

### Admin & Analytics

- **ADMN-V2-01**: Usage analytics dashboard (token spend by model, cost breakdown)
- **ADMN-V2-02**: Email notifications to user when access request is approved/denied

### Customization

- **CUST-V2-01**: Admin can configure custom system prompts per user or globally

## Out of Scope

| Feature | Reason |
|---------|--------|
| OAuth / Google SSO | Magic link is sufficient for v1; avoids OAuth setup complexity |
| Real-time streaming responses | Full response delivery for v1; lower implementation complexity |
| Multi-organization support | Single org deployment; not needed for internal tool |
| File / image attachments in chat | Text-only for v1; storage and processing complexity deferred |
| Per-user custom system prompts | Global config only for v1; customization deferred |
| Billing or payment integration | Single org API key; no per-user billing needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| ACCS-01 | Phase 2 | Complete |
| ACCS-02 | Phase 2 | Complete |
| ACCS-03 | Phase 2 | Complete |
| ACCS-04 | Phase 2 | Complete |
| ACCS-05 | Phase 2 | Complete |
| ACCS-06 | Phase 2 | Complete |
| CHAT-01 | Phase 3 | Complete |
| CHAT-02 | Phase 3 | Complete |
| CHAT-03 | Phase 3 | Complete |
| CHAT-04 | Phase 3 | Complete |
| CHAT-05 | Phase 3 | Complete |
| ADMN-01 | Phase 4 | Pending |
| ADMN-02 | Phase 4 | Pending |
| ADMN-03 | Phase 4 | Pending |
| ADMN-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-06*
*Last updated: 2026-08-06 after roadmap creation*
