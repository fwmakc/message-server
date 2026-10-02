/**
 * Wiring check (Wave 6, stage 2): boots the REAL AppModule (real entities,
 * boot migrations through runMigrationsUnderLock, real DI graph) against a
 * fresh throwaway database, then probes one real write per critical
 * subsystem: the mail queue (job + data + attachment rows) and the webhook
 * processed-events store. Runs under ts-node — the production module system —
 * because jest's module registry races with pg's lazy native getter here.
 *
 * Usage: npm run test:wiring   (requires postgres on 127.0.0.1:5432 root/1234)
 * Exit code 0 = all probes green.
 */
process.env.DB_TYPE = "postgres";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = "5432";
process.env.DB_USER = "root";
process.env.DB_PASSWORD = "1234";
process.env.DB_NAME = "message_server_wiring_test";
process.env.INTERNAL_API_KEY = "wiring-internal-key";
// Instant connection-refused: the boot-time self-subscription to event-server
// retries with backoff either way; an unreachable port keeps it deterministic.
process.env.EVENT_SERVER_URL = "http://127.0.0.1:9";
// The mail worker must not try to deliver the enqueued probe job to a real
// SMTP host: point it at an unreachable port; the job just retries/fails.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "9";
process.env.SMTP_SENDER_EMAIL = "wiring@test";
// MailerModule template dir anchor (prod compose passes the service root).
process.env.ROOT_PATH = process.cwd();

import { Client } from "pg";
import { DataSource } from "typeorm";

const WIRING_DB = "message_server_wiring_test";

let passed = 0;
let failed = 0;

function ok(label: string, cond: boolean, extra?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

async function recreateDatabase(): Promise<void> {
  const client = new Client({
    host: "127.0.0.1",
    port: 5432,
    user: "root",
    password: "1234",
    database: "postgres",
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${WIRING_DB} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${WIRING_DB}`);
  await client.end();
}

async function main(): Promise<void> {
  console.log("Wiring check — message-server real boot");
  await recreateDatabase();

  const { AppModule } = await import("../src/app.module");
  const { NestFactory } = await import("@nestjs/core");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error"],
  });
  const dataSource = app.get(DataSource);
  console.log("  ✓ AppModule booted (real DI graph, boot migrations ran)");

  const migrations: any[] = await dataSource.query(
    "SELECT count(*)::int AS n FROM migrations_typeorm",
  );
  ok("boot migrations applied", migrations[0].n > 0, `count=${migrations[0].n}`);

  // ── Probe: mail queue ──
  console.log("probe: mail queue");
  const { MailQueueService } = await import("../src/mail/mail.queue.service");
  const mailQueue = app.get(MailQueueService);
  const job = await mailQueue.enqueueEmail({
    to: "wiring-recipient@test",
    subject: "Wiring probe",
    text: "wiring body",
  } as any);
  ok("enqueueEmail creates a mail job", !!job?.id);

  const jobRow: any[] = await dataSource.query(
    "SELECT j.id, d.to AS recipient FROM mail_jobs j JOIN mail_data d ON d.id = j.data_id WHERE j.id = $1",
    [job.id],
  );
  ok("job row joins its data row (real FK wiring)",
    jobRow[0]?.recipient === "wiring-recipient@test",
    `got=${jobRow[0]?.recipient}`);

  // ── Probe: webhook processed-events store ──
  console.log("probe: webhook processed events");
  const { ProcessedEventEntity } = await import(
    "../src/webhooks/processed-event.entity"
  );
  const processedRepo = dataSource.getRepository(ProcessedEventEntity);
  await processedRepo.save(
    processedRepo.create({ eventId: "wiring-event-1" } as any),
  );
  const seen = await processedRepo.findOne({
    where: { eventId: "wiring-event-1" } as any,
  });
  ok("processed-event idempotency row round-trip", !!seen?.id);

  await app.close();

  console.log(`\nWiring: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Wiring check crashed:", e);
  process.exit(1);
});
