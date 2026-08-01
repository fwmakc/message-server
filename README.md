# Message Server

Email sending, notification dispatch, and event-driven messaging microservice. Uses a persistent DB-backed mail queue with retry, exponential backoff, and automatic cleanup.

Port **3003**. Part of the microservices split (Stage 7, Issue #6).

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

## Development

```bash
cp .env.example .env
# Set DB_SYNCHRONIZE=true for dev schema sync
npm install
npm run dev
```

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

## Port Assignments

| Service | Port |
|---------|------|
| auth-server | 3001 |
| file-server | 3002 |
| **message-server** | **3003** |
| chat-server | 3004 |
| event-server | 3005 |
| api-server | 5000 |
