import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMailSuppressions1792200000000 implements MigrationInterface {
    name = 'AddMailSuppressions1792200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "mail_suppressions" (
            "id" SERIAL NOT NULL,
            "email" varchar NOT NULL,
            "reason" varchar NOT NULL,
            "provider" varchar,
            "detail" text,
            "created_at" timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT "PK_mail_suppressions_id" PRIMARY KEY ("id")
        )`);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_mail_suppressions_email" ON "mail_suppressions" ("email")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_mail_suppressions_email"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "mail_suppressions"`);
    }
}
