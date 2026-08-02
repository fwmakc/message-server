# Contributing to message-server

Thanks for your interest in contributing! This service is part of the
[fwmakc microservices stack](https://github.com/fwmakc/gateway-server).

## Prerequisites

- **Node.js** 20+ (`node -v`)
- **npm** 10+
- **PostgreSQL** 14+ (or use Docker: `docker compose up -d postgres`)
- **SMTP** server (or use a dev mail service like Mailtrap)

## Development Setup

```bash
git clone https://github.com/fwmakc/message-server.git
cd message-server
cp .env.example .env
# Set DB_SYNCHRONIZE=true for dev schema sync
npm install
npm run dev
```

Service runs on port **3003**. Swagger UI at `http://localhost:3003/swagger`.

## Testing

```bash
npm test
```

5 test suites, 33 tests. Tests use real PostgreSQL with `dropSchema: true` +
`synchronize: true`. Tests cover: webhooks, mail sending, queue processing,
worker retry, subscriber events.

## TypeORM Migrations

```bash
npm run migration:auto    # Generate migration from entity changes
npm run migration:create -- --name=Init  # Create empty migration
npm run migration:run     # Apply migrations
npm run migration:revert  # Revert last migration
npm run migration:fake    # Mark as applied without executing
```

## Code Style

- TypeScript with strict type checking
- NestJS conventions (modules, controllers, services, DTOs)
- Use toolkit queue system (`QueueJobEntity`, `QueueWorker`, `QueueService`)
- Use `InternalAuthGuard` for service-to-service endpoints
- See `AGENTS.md` for detailed conventions

## Pull Request Process

1. Fork the repo, create a branch from `master`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Ensure TypeScript compiles: `npm run build`
5. Create a pull request with a clear description
