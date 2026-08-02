# Message Server

> Email queue with retry, EJS templates, and event-driven subscriber.

## What This Is

A **working scaffold** — not a demo, not a toy. Production-ready email service
with DB-backed queue, exponential backoff retry, EJS templates, and automatic
cleanup. Subscribes to event-server for triggered emails (registration,
password reset, account lifecycle).

Part of a [microservices stack](https://github.com/fwmakc/gateway-server) —
receives events from event-server via webhooks, sends email via SMTP.

Port **3003**.

---

## Architecture

```
auth-server ──[event]──> event-server ──[webhook]──> message-server
                                                         │
                     POST /mail/send ──────────────────┘ │
                                                         │
                                              ┌──────────┴──────────┐
                                              │   Mail Queue (DB)   │
                                              │   mail_jobs table    │
                                              └──────────┬──────────┘
                                                         │
                                              MailWorker polls
                                                         │
                                              ┌──────────┴──────────┐
                                              │  SMTP (nodemailer)  │
                                              │  EJS templates      │
                                              └─────────────────────┘
```

### Modules

| Module | Responsibility |
|--------|---------------|
| `DatabaseModule` | TypeORM PostgreSQL connection, entity registration |
| `AuthModule` | Passport JWT strategy (verifies tokens via auth-server JWKS) |
| `MailModule` | Mailer (SMTP), mail queue, mail worker, 3 controllers |
| `WebhooksModule` | Event-server webhook receiver, subscriber registration |

### Entities

| Entity | Table | Description |
|--------|-------|-------------|
| `MailJobEntity` | `mail_jobs` | Queue job — extends toolkit `QueueJobEntity` (id, status, attempts, errorMessage). Links to `MailDataEntity`. |
| `MailDataEntity` | `mail_data` | Email content — to, from, subject, text, html, template, payload. Links to attachments. |
| `MailAttachmentEntity` | `mail_attachments` | File attachments — filename, contentType, content (base64) or path. |

---

## API Endpoints

### Mail

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/mail/send` | — | Enqueue raw email (to/subject/text/html + optional file attachments) |
| POST | `/mail/send_by_template` | — | Enqueue templated email (options + `data` body + optional attachments) |
| GET | `/mail/status/:id` | `InternalAuthGuard` | Check queue job status (id, status, attempts, errorMessage) |

> `/mail/send*` endpoints are `@ApiExcludeController` (hidden from Swagger). Security relies on network isolation — message-server is not exposed in nginx.

### Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/events` | `InternalAuthGuard` | Receive event from event-server (`WebhookEnvelopeDto`) |

---

## Mail Queue System

Built on the toolkit's generic TypeORM queue infrastructure (`QueueJobEntity`, `QueueService`, `QueueWorker`).

### Flow

1. **Enqueue** — `MailQueueService` persists a `mail_jobs` row (status: `pending`) with nested `mail_data` + `mail_attachments`
2. **Poll** — `MailWorker` runs every `WORKER_INTERVAL_MS`, picks pending jobs (batch size: `BATCH_SIZE`)
3. **Send** — Renders EJS template (if set), sends via nodemailer/SMTP
4. **Retry** — On failure: exponential backoff (`MAIL_RETRY_DELAY * 2^attempt`), up to `MAIL_MAX_ATTEMPTS`
5. **Cleanup** — Old `done`/`failed` jobs deleted after `MAIL_CLEANUP_MAX_AGE_DAYS`

### Queue worker configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_INTERVAL_MS` | 5000 | Polling cycle (ms) |
| `BATCH_SIZE` | 50 | Max jobs per cycle |
| `MAIL_MAX_ATTEMPTS` | 5 | Max retry attempts |
| `MAIL_RETRY_DELAY` | 5 | Base retry delay (seconds) |
| `MAIL_CLEANUP_INTERVAL` | 3600000 | Cleanup cycle (ms) |
| `MAIL_CLEANUP_MAX_AGE_DAYS` | 30 | Delete jobs older than this |

---

## Event Consumption

### Subscribed patterns

message-server registers itself with event-server on startup via `SubscriberService` (with exponential backoff retry):

| Pattern | Handler | Action |
|---------|---------|--------|
| `user.registered` | `onUserRegistered()` | If `confirmUrl` present → enqueue **`register`** template email |
| `user.confirmed` | `onUserConfirmed()` | Logs only (no email sent) |
| `password.reset` | `onPasswordReset()` | Enqueue **`reset`** template email with reset URL |

### Webhook envelope

Received via `POST /webhooks/events` (typed with `WebhookEnvelopeDto` from `event-server/contracts`):

```json
{
  "eventId": 42,
  "pattern": "user.registered",
  "payload": { "userId": 123, "username": "user@example.com", "confirmUrl": "https://..." },
  "source": "auth-server",
  "timestamp": "2026-07-21T14:30:00.000Z",
  "attempt": 1
}
```

---

## Email Templates (EJS)

Templates stored in `views/mail/`:

| Template | Trigger | Content |
|----------|---------|---------|
| `register.ejs` | `user.registered` event | Registration confirmation with activation button |
| `reset.ejs` | `password.reset` event | Password reset with link (1-hour expiry) |
| `default.ejs` | Manual `send_by_template` | Generic — uses `data.title`, `data.description`, `data.url` |
| `partials/button.ejs` | (shared partial) | Styled CTA button — included by all templates |

Template context: `{ data: { url, title, description } }` — the `url` field drives the button partial.

---

## SMTP Configuration

Configured via `@nestjs-modules/mailer` with EJS adapter. Transport built as connection URL:

```
smtp(s)://USER:PASSWORD@HOST:PORT
```

- `SMTP_SECURE=true` → `smtps://` (TLS), otherwise `smtp://`
- Default `from`: `"${SMTP_SENDER_NAME}" <${SMTP_SENDER_EMAIL}>`

---

## Configuration

See `.env.example`. Key variables:

### Server
- `PORT` (3003), `IP`, `NODE_ENV`, `ROOT_PATH`, `PREFIX`
- `SENTRY_DSN`, `SENTRY_ENV`, `MORGAN_LOG_FORMAT`

### Database
- `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME` (message_server), `DB_USER`, `DB_PASSWORD`
- `DB_SYNCHRONIZE` (default: false — set `true` for dev)
- `DB_LOG`

### SMTP
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`
- `SMTP_SENDER_NAME`, `SMTP_SENDER_EMAIL`

### Inter-service
- `INTERNAL_API_KEY` — shared key for `X-Internal-Api-Key` header validation
- `EVENT_SERVER_URL` — event-server base URL (default: `http://event-server:3005`)
- `WEBHOOK_URL` — this service's webhook endpoint (default: `http://message-server:3003/webhooks/events`)
- `AUTH_SERVER_URL` — auth-server base URL for JWT verification via JWKS

### Queue Worker
- `WORKER_INTERVAL_MS`, `BATCH_SIZE`, `MAIL_MAX_ATTEMPTS`, `MAIL_RETRY_DELAY`
- `MAIL_CLEANUP_INTERVAL`, `MAIL_CLEANUP_MAX_AGE_DAYS`

### Swagger
- `SWAGGER_PREFIX`, `SWAGGER_PREFIX_REDOC`, `SWAGGER_TITLE`, `SWAGGER_DESCRIPTION`, `SWAGGER_VERSION`

> **Note:** `INTERNAL_API_KEY`, `EVENT_SERVER_URL`, `WEBHOOK_URL`, and `PREFIX` are read in code but not yet in `.env.example`.

---

## Docker

Built from repo root (context = `..`) so the Dockerfile can access `api-server-toolkit/` and `event-server/` siblings.

**Key build steps:**
1. `npm install --legacy-peer-deps --ignore-scripts` (skips git dep preparation)
2. Override `api-server-toolkit` with local `dist/` + `src/` (for queue module)
3. Override `event-server` with pre-built `dist/contracts/` (for typed webhook DTOs)
4. Compile TypeScript

```yaml
# gateway-server/docker-compose.yml
message-server:
  build:
    context: ..
    dockerfile: message-server/Dockerfile
  environment:
    - PORT=3003
    - DB_HOST=postgres
    - DB_NAME=message_server
    - EVENT_SERVER_URL=http://event-server:3005
    - INTERNAL_API_KEY=${INTERNAL_API_KEY:-changeme}
    # ... see .env.example for full list
```

---

## Quick start

```bash
cp .env.example .env
# Set DB_SYNCHRONIZE=true for dev schema sync
npm install
npm run dev
```

Message server runs on port **3003**.
Swagger UI at `http://localhost:3003/swagger`.

### TypeORM Migrations

```bash
npm run migration:auto   # Generate migration from entity changes
npm run migration:create -- --name=Init  # Create empty migration
npm run migration:run    # Apply migrations
npm run migration:revert # Revert last migration
npm run migration:fake   # Mark as applied without executing
```

---

## Dependencies

- **NestJS 9** — framework, Swagger, TypeORM, Passport
- **api-server-toolkit** — shared framework (queue system, guards, helpers)
- **event-server** — event contract DTOs (typed webhook consumption)
- **@nestjs-modules/mailer** + **nodemailer** — SMTP email
- **ejs** — template engine
- **jwks-rsa** — RS256 JWKS key fetching (JWT verification)
- **multer** — file attachment uploads
- **pg** — PostgreSQL driver
- **axios** — HTTP client (subscriber registration with event-server)
- **@sentry/nestjs** — error tracking

---

## Integration into existing infrastructure

**Already have an email service?** message-server provides:
- DB-backed queue with retry and exponential backoff
- EJS template rendering
- Event-driven (subscribes to event-server webhooks)

**Replacing with SQS + SendGrid / Mailgun:**
1. Replace the mail queue table with SQS
2. Replace nodemailer with SendGrid/Mailgun API calls
3. Keep the webhook handler — it receives events from event-server

## Migration

**From a monolith:** message-server was extracted from a monolithic backend. The mail
queue, templates, and SMTP config all live here.

## AI-Friendly Documentation

This service is designed for AI-assisted development. You can feed context
to any LLM (ChatGPT, Claude, Cursor, Copilot) and get code that follows
all conventions — without reading the entire codebase.

### ai-context.md
Auto-generated structured reference: every controller, route, service,
entity, and DTO. Run `npm run ai-context` to regenerate.

### Swagger UI
Interactive API exploration at `/swagger` — inspect webhook endpoints,
mail queue status, subscriber patterns.

### ReDoc
Clean, readable documentation at `/redoc` — share with your team.

### Why this matters
An LLM with `ai-context.md` can generate new EJS email templates, webhook
handlers, and queue processors that match your existing patterns — without
studying the codebase.

## Backend-Only — Bring Your Own Frontend

This service handles email delivery and event subscriptions. No frontend
included. Users never interact with message-server directly — it receives
events from event-server and sends email via SMTP.

All configuration is via `.env` and EJS templates in `views/`. Integrate
with any frontend framework — your app just triggers events (e.g.,
`user.registered`) and message-server handles the email delivery.

## Integrating into existing infrastructure

- **Already have an email service (SendGrid, Mailgun, SES)?** Replace
  the SMTP transport in the mail service. The queue, retry logic, and
  event subscription stay the same.
- **Already have an event system?** Message-server subscribes to
  event-server via webhooks. Point it at your existing event broker's
  HTTP output — no code changes needed.
- **Migrating from a monolith?** Extract email sending one template at
  a time. Your monolith keeps working; message-server takes over email
  delivery gradually.

## Related Services

| Service | Role | Repo |
|---------|------|------|
| event-server | Delivers events to message-server via webhook | [fwmakc/event-server](https://github.com/fwmakc/event-server) |
| auth-server | Triggers emails (user.registered, password.reset) | [fwmakc/auth-server](https://github.com/fwmakc/auth-server) |
| api-server | Domain events that may trigger notifications | [fwmakc/api-server](https://github.com/fwmakc/api-server) |
| api-server-toolkit | Shared library (queue system, guards) | [fwmakc/api-server-toolkit](https://github.com/fwmakc/api-server-toolkit) |
| gateway-server | Nginx reverse proxy + Docker Compose | [fwmakc/gateway-server](https://github.com/fwmakc/gateway-server) |
| scaffold | Template for new services | [fwmakc/scaffold](https://github.com/fwmakc/scaffold) |

---

## Port Assignments

| Service | Port |
|---------|------|
| auth-server | 3001 |
| file-server | 3002 |
| **message-server** | **3003** |
| chat-server | 3004 |
| event-server | 3005 |
| api-server | 5000 |

---

## Versioning

All services in the fwmakc stack share the same **major version**. Same major = guaranteed compatibility.

| Level | Scope | Example |
|-------|-------|---------|
| **Major** | Shared across ALL services. A breaking change in any service bumps the major for everyone. | toolkit 2.x → 3.0.0 ⟹ all services tag v3.0.0 |
| **Minor** | Independent per service. New features (additive). | auth-server 2.1.0 → 2.2.0 |
| **Patch** | Independent per service. Bug fixes. | event-server 2.0.0 → 2.0.1 |

### What triggers a major bump

A breaking change at any intersection point:

- **api-server-toolkit** — guards, columns, decorators, EntityController, bootstrap, services
- **event-server contracts** — DTO field removed/renamed, required field added
- **Inter-service API** — JWT claim format, `X-Internal-Api-Key` scheme, webhook contract
- **Public API** — any endpoint that another service depends on

### What does NOT trigger a major bump

- Bug fixes, performance improvements
- New features (additive — new optional fields, new endpoints)
- Internal refactoring that doesn't change interfaces

### Alignment process

When a service makes a breaking change (e.g., toolkit 2.x → 3.0.0):

1. The changing service bumps its major and tags the release
2. **All other services** get a stack alignment commit:
   - Bump `version` in `package.json`
   - Add CHANGELOG entry: `chore: stack v3 alignment`
   - Update dependency pins if needed
   - Tag `v3.0.0`
3. All services are now on stack v3

### Current versions

| Service | Version |
|---------|---------|
| [api-server-toolkit](https://github.com/fwmakc/api-server-toolkit) | v2.1.0 |
| [event-server](https://github.com/fwmakc/event-server) | v2.0.0 |
| [auth-server](https://github.com/fwmakc/auth-server) | v2.0.0 |
| [message-server](https://github.com/fwmakc/message-server) | v2.0.0 |
| [file-server](https://github.com/fwmakc/file-server) | v2.0.0 |
| [chat-server](https://github.com/fwmakc/chat-server) | v2.0.0 |
| [api-server](https://github.com/fwmakc/api-server) | v2.0.0 |
| [gateway-server](https://github.com/fwmakc/gateway-server) | v2.0.0 |
| [scaffold](https://github.com/fwmakc/scaffold) | v2.0.0 |
