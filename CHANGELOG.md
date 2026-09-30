# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.7] - 2026-09-30
### Changed
- Toolkit pinned `#v0.22.0` (self-pentest wave 4): Access-бины fail-closed, delete-гварды для tenant-биндов, scoped `movePosition`, search relation clamp, `getClientIp()`/`TRUST_PROXY`.

## [0.6.6] - 2026-09-30
### Added
- `AuditModule.forRoot()` (toolkit 0.21.1): successful mutations (non-GET 2xx) are audited as `data.created` / `data.updated` / `data.deleted` and 403s as `access.denied`, published to event-server 0.8.0's tamper-evident `audit_events` store.

### Changed
- Pins: toolkit `#v0.21.1`, event-server `#v0.8.0` (from legacy `#v1.1.0`).

## [0.6.5] - 2026-09-29
### Changed
- Toolkit pinned to v0.20.3 (QueueWorker claim: Postgres forbids FOR UPDATE on the nullable side of an outer join — relations are now hydrated by a second lock-free query inside the claim transaction).

## [0.6.4] - 2026-09-29
### Fixed
- SMTP transport string contained empty credentials (`smtp://:@host`) when `SMTP_USER` was unset — nodemailer then attempted PLAIN auth with empty credentials and every send failed with «Missing credentials for "PLAIN"». Credentials are now embedded only when `SMTP_USER` is set, and URL-encoded (`encodeURIComponent`), so passwords with `@` or `:` no longer break the URL.

## [0.6.3] - 2026-09-29
### Changed
- Toolkit pinned to v0.20.2 (bootstrap binds 0.0.0.0 by default).

## [0.6.2] - 2026-09-29
### Fixed
- Boot failed with ERR_PACKAGE_PATH_NOT_EXPORTED: the EjsAdapter deep import `@nestjs-modules/mailer/dist/adapters/ejs.adapter` is blocked by the package exports map (jest tolerates it, Node does not). Import switched to the exported subpath `@nestjs-modules/mailer/adapters/ejs.adapter`.

## [0.6.1] - 2026-09-29
### Fixed
- Docker image failed to boot with `Cannot find module '/app/dist/main'`: root-level `jest.config.js` and `scripts/` (allowJs) shifted the tsc common root, so the build landed in `dist/src/`. `tsconfig.build.json` now pins `rootDir: "src"` and `include: ["src/**/*.ts"]`.

## [0.6.0] - 2026-09-29
### Fixed
- src/config/typeorm.config.ts no longer self-initializes the DataSource on import — it raced with the CLI initialization and made migration commands flaky.
### Changed
- Database schema is now owned exclusively by TypeORM migrations. DB_SYNCHRONIZE / DB_MIGRATIONS_RUN env vars are removed: pending migrations are applied on every boot (hardcoded migrationsRun: true), so the first boot on an empty database initializes the schema.

## [0.5.0] - 2026-09-28

### Added
- `GET /mail/failed` — paginated list of failed mail jobs (recipient, subject, attempts, error message).
- `POST /mail/failed/:id/requeue` — requeue a failed job with a fresh attempt budget (400 for non-failed jobs, 404 for unknown ids). Operator loop: list → fix SMTP/config → requeue.
- Prometheus `/metrics` endpoint via toolkit `MetricsModule` v0.19.0.

## [0.4.1] - 2026-09-28
### Changed
- Node.js runtime bumped 22 → 24 LTS: Docker images `node:24-alpine`, CI `node-version: 24`.
- Toolkit pinned to `api-server-toolkit#v0.18.0` (adds `ApiKeyGuard` / `@ApiKey()`; no behavior change for existing routes).

## [0.4.0] - 2026-08-03

Version reset to pre-release. The message server is functional (33 tests, queue system, SMTP, event-driven) but the overall stack is not yet production-hardened. Pinned to `api-server-toolkit#v0.9.0`.

## [2.0.0] - 2026-08-03

### Stack v2 alignment
- Major version aligned with api-server-toolkit v2.x
- Pinned to `api-server-toolkit#v2.1.0`
- Pinned to `event-server#v2.0.0`
- DB-backed mail queue with retry, exponential backoff, automatic cleanup
- EJS email templates
- Event subscriber (user.registered, password.reset, user.deactivated, user.deleted)
- 5 test suites, 33 tests
