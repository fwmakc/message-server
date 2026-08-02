import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785628659855 implements MigrationInterface {
    name = 'InitialSchema1785628659855'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "mail_attachments" ("id" SERIAL NOT NULL, "mail_data_id" integer NOT NULL, "filename" character varying NOT NULL, "content_type" character varying NOT NULL, "content" text, "path" character varying, "mailDataId" integer, CONSTRAINT "PK_1b6ac15a94bd06175b552b539e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mail_data" ("id" SERIAL NOT NULL, "to" character varying NOT NULL, "from" character varying, "subject" character varying NOT NULL, "text" text, "html" text, "template" character varying, "payload" jsonb, CONSTRAINT "PK_63fe5a0452bc286e0d057899bc3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "mail_jobs" ("id" SERIAL NOT NULL, "status" character varying NOT NULL DEFAULT 'pending', "attempts" integer NOT NULL DEFAULT '0', "last_attempt_at" TIMESTAMP WITH TIME ZONE, "next_attempt_at" TIMESTAMP WITH TIME ZONE, "error_message" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "data_id" integer, CONSTRAINT "REL_c43b399ef2392e05204bab1a36" UNIQUE ("data_id"), CONSTRAINT "PK_00b07e7a4a840474700d5dbf90e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "mail_attachments" ADD CONSTRAINT "FK_383677386aa229cdb3d040095e8" FOREIGN KEY ("mailDataId") REFERENCES "mail_data"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "mail_jobs" ADD CONSTRAINT "FK_c43b399ef2392e05204bab1a36a" FOREIGN KEY ("data_id") REFERENCES "mail_data"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mail_jobs" DROP CONSTRAINT "FK_c43b399ef2392e05204bab1a36a"`);
        await queryRunner.query(`ALTER TABLE "mail_attachments" DROP CONSTRAINT "FK_383677386aa229cdb3d040095e8"`);
        await queryRunner.query(`DROP TABLE "mail_jobs"`);
        await queryRunner.query(`DROP TABLE "mail_data"`);
        await queryRunner.query(`DROP TABLE "mail_attachments"`);
    }

}
