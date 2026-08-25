# KickoffAI

Internal AI chat backend for Kickoff Africa — a private, org-only alternative to ChatGPT powered by Ollama.

## Overview

KickoffAI gives every Kickoff Africa team member access to Ollama-powered chat within a governed, auditable system. Org members authenticate via magic link, consume AI within a metered time window, and can request extensions from admins. All conversations and usage are tracked and visible to administrators.

## Features

- **Magic link auth** — no passwords; login links sent to org email, expire in 15 minutes and are single-use
- **JWT sessions** — stateless auth with jti-based revocation on logout
- **Metered access** — 1 hour of free AI time per 12-hour rolling window, tracked cumulatively in seconds
- **Extension requests** — users request +1, +2, or +3 bonus hours; admins approve or deny
- **Smart model routing** — messages auto-classified by a lightweight Ollama model, then routed to the appropriate configured model (simple/moderate/complex/vision)
- **Full conversation history** — all messages stored with model used and token count
- **Admin panel** — full visibility into users, conversations, usage stats, and extension requests
- **Structured logging** — pino with pretty-printing in development, JSON in production
- **OpenAPI docs** — interactive Swagger UI served at `/docs`

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Database | PostgreSQL |
| AI | Ollama (self-hosted, via HTTP API) |
| Auth | JWT (`jsonwebtoken`) + magic links |
| Logging | pino + pino-http |
| Docs | swagger-jsdoc + swagger-ui-express |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- An Ollama server reachable over HTTP (with the desired models pulled)
- SMTP credentials (or `NODE_ENV=development` to log magic links to console)

### Installation

```bash
git clone <repo-url>
cd kickoff-ai
npm install
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/kickoffai
JWT_SECRET=your-32-char-secret
JWT_EXPIRY=24h
MAGIC_LINK_EXPIRY_MINUTES=15
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@kickoff.africa
APP_URL=http://localhost:3000
ADMIN_EMAIL=work@kickoff.africa
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_SIMPLE_MODEL=gemma4b:latest
OLLAMA_MODERATE_MODEL=gemma4b:latest
OLLAMA_COMPLEX_MODEL=gemma4b:latest
OLLAMA_VISION_MODEL=gemma4b:latest
```

### Database Setup

```bash
npm run migrate
```

This runs all pending migrations idempotently. Safe to run multiple times.

### Development

```bash
npm run dev
```

Server starts on `http://localhost:3000`. In development mode:
- Magic links are logged to the console instead of sent via email
- Logs are pretty-printed with colors

### Production

```bash
npm run build
npm run start
```

Logs output as newline-delimited JSON. Use `LOG_LEVEL` to control verbosity (default: `info`).

## API Reference

Interactive docs available at `http://localhost:3000/docs` when the server is running.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/request-magic-link` | — | Send magic link to email |
| `GET` | `/auth/verify?token=...` | — | Verify token, receive JWT |
| `GET` | `/auth/me` | JWT | Current user profile |
| `POST` | `/auth/logout` | JWT | Revoke session |

### Access

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/access/status` | JWT | Remaining time in current window |

### Extension Requests

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/extensions/request` | JWT | Request +1/+2/+3 hours |
| `GET` | `/extensions/pending` | Admin | List pending requests |
| `POST` | `/extensions/:id/approve` | Admin | Approve and grant time |
| `POST` | `/extensions/:id/deny` | Admin | Deny request |

### Conversations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/conversations` | JWT | Create conversation |
| `GET` | `/conversations` | JWT | List your conversations |
| `GET` | `/conversations/:id` | JWT | Get conversation + messages |
| `POST` | `/conversations/:id/messages` | JWT | Send message, receive Ollama response |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/admin/users` | Admin | All users with usage stats |
| `GET` | `/admin/users/:userId/conversations` | Admin | All conversations for any user |
| `GET` | `/admin/conversations/:id/messages` | Admin | Any conversation + full history |
| `GET` | `/admin/extensions` | Admin | All extension requests (`?status=pending\|approved\|denied`) |
| `PATCH` | `/admin/users/:userId/promote` | Admin | Promote user to admin |

## Model Routing

Each message is classified by an Ollama model before the main response is generated:

| Complexity | Examples | Model |
|------------|----------|-------|
| Simple | Greetings, factual lookups, basic tasks | `OLLAMA_SIMPLE_MODEL` |
| Moderate | Analysis, comparisons, multi-step reasoning | `OLLAMA_MODERATE_MODEL` |
| Complex | Deep research, creative writing, expert problems | `OLLAMA_COMPLEX_MODEL` |
| Image attached | Any message with an image attachment | `OLLAMA_VISION_MODEL` |

All model names are configured via environment variables and default to `gemma4b:latest`.

## Admin Bootstrap

The account specified in `ADMIN_EMAIL` is automatically seeded as an admin user on every server startup (idempotent). Additional admins can be promoted via `PATCH /admin/users/:userId/promote`.

## Project Structure

```
src/
├── config/
│   ├── database.ts      # pg Pool + query helper
│   ├── env.ts           # Typed env config with validation
│   ├── logger.ts        # pino logger instance
│   └── swagger.ts       # OpenAPI spec + swagger-jsdoc config
├── db/
│   ├── migrate.ts       # Idempotent migration runner
│   ├── seed.ts          # Admin user seed
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_add_extension_seconds.sql
├── middleware/
│   ├── authenticate.ts  # JWT verification + requireAdmin
│   └── checkAccess.ts   # Access window gate (429 when exhausted)
├── routes/
│   ├── access.ts        # GET /access/status
│   ├── admin.ts         # /admin/* (admin-only)
│   ├── auth.ts          # /auth/*
│   ├── conversations.ts # /conversations (CRUD)
│   ├── extensions.ts    # /extensions/*
│   └── messages.ts      # POST /conversations/:id/messages
├── services/
│   ├── access.ts        # Access window logic (get/create/addUsage/extend)
│   ├── ollama.ts        # Ollama HTTP API (classify + route + chat)
│   ├── email.ts         # nodemailer magic link delivery
│   └── token.ts         # Magic token generation + JWT sign/verify
└── index.ts             # App bootstrap, router mounting, server start
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | HTTP server port |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `JWT_SECRET` | Yes | — | Secret for JWT signing (min 32 chars recommended) |
| `JWT_EXPIRY` | No | `24h` | JWT lifetime (`15m`, `24h`, `7d`, etc.) |
| `MAGIC_LINK_EXPIRY_MINUTES` | No | `15` | Magic link TTL in minutes |
| `SMTP_HOST` | No | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | `noreply@kickoff.africa` | Sender address |
| `APP_URL` | No | `http://localhost:3000` | Public URL (used in magic link emails) |
| `ADMIN_EMAIL` | Yes | — | Email address seeded as admin on startup |
| `OLLAMA_BASE_URL` | No | `http://203.161.52.27:11434` | Ollama server URL |
| `OLLAMA_SIMPLE_MODEL` | No | `gemma4b:latest` | Model for simple-complexity messages |
| `OLLAMA_MODERATE_MODEL` | No | `gemma4b:latest` | Model for moderate-complexity messages |
| `OLLAMA_COMPLEX_MODEL` | No | `gemma4b:latest` | Model for complex-complexity messages |
| `OLLAMA_VISION_MODEL` | No | `gemma4b:latest` | Model used when an image is attached |
| `LOG_LEVEL` | No | `info` | pino log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |
| `NODE_ENV` | No | — | Set to `production` to enable JSON logs and SMTP delivery |
