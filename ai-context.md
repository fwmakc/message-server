# AI Context — message-server

> Auto-generated. Run `npm run ai-context` to regenerate.
> Generated: 2026-09-30T15:54:49.490Z

---

## Controllers

### WebhooksController

Base path: `/webhooks`

| Method | Path |
|--------|------|
| `POST` | `/webhooks/events` |

---

## Services

### MailQueueService extends `QueueService`

- `enqueueEmail(options: MailDto,
    attachments?: MailAttachmentEntity[],): Promise<MailJobEntity>`
- `requeue(id: number): Promise<MailJobEntity | null>`
- `enqueueTemplate(options: MailDto,
    payload: object,
    attachments?: MailAttachmentEntity[],): Promise<MailJobEntity>`

### SubscriberService

- `onApplicationBootstrap(): Promise<void>`
- `register(retry = 0): Promise<void>`

### WebhooksService

- `handleEvent(event: WebhookEnvelopeDto): Promise<void>`
- `onUserRegistered(payload: UserRegisteredDto): Promise<void>`
- `log(`User registered (already activated): userId=$`
- `onUserConfirmed(payload: UserConfirmedDto): Promise<void>`
- `onPasswordReset(payload: PasswordResetDto): Promise<void>`
- `onUserTwoFactorCode(payload: UserTwoFactorCodeDto,): Promise<void>`

---

## Entities

### MailAttachmentEntity (table: `mail_attachments`)

Relations: `MailDataEntity`


### MailDataEntity (table: `mail_data`)

Relations: `MailAttachmentEntity`


### MailJobEntity (table: `mail_jobs`)

Relations: `MailDataEntity`


---

## DTOs

### CommonDto

| Field | Type | Optional |
|-------|------|----------|
| `id` | `number` | yes |

### MailDto

| Field | Type | Optional |
|-------|------|----------|
| `from` | `string` | yes |
| `to` | `string` | no |
| `subject` | `string` | yes |
| `text` | `string` | yes |
| `html` | `string` | yes |
| `template` | `string` | yes |
