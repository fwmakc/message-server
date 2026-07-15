# Message Server

Email sending, notification dispatch, and event-driven messaging microservice.

Part of the fwmakc microservices split (Issue #6, Stage 7).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mail/send` | Send email (supports attachments) |
| POST | `/mail/send_by_template` | Send email using EJS template |

## Environment

See `.env.example`. Key variables:

- `AUTH_SERVER_URL` — auth-server base URL for JWT verification via JWKS
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` — SMTP server config
- `SMTP_SENDER_NAME` / `SMTP_SENDER_EMAIL` — from address

## Development

```bash
cp .env.example .env
npm install
npm run dev
```
