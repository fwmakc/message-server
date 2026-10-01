import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessedEvents1792100000000 implements MigrationInterface {
    name = 'AddProcessedEvents1792100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "webhook_processed_events" (
            "id" SERIAL NOT NULL,
            "event_id" varchar NOT NULL,
            "created_at" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT "PK_webhook_processed_events_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_webhook_processed_events_event_id" ON "webhook_processed_events" ("event_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_webhook_processed_events_event_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "webhook_processed_events"`);
    }
}
