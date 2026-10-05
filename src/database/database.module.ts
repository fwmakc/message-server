import { join } from "path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource, DataSourceOptions } from "typeorm";
import { runMigrationsUnderLock } from "api-server-toolkit/db";
import { MailJobEntity } from "@src/mail/mail-job.entity";
import { MailDataEntity } from "@src/mail/mail-data.entity";
import { MailAttachmentEntity } from "@src/mail/mail-attachment.entity";
import { MailSuppressionEntity } from "@src/mail/mail-suppression.entity";
import { ProcessedEventEntity } from "@src/webhooks/processed-event.entity";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("DB_HOST", "localhost"),
        port: Number(config.get("DB_PORT", 5432)),
        username: config.get<string>("DB_USER", "root"),
        password: config.get<string>("DB_PASSWORD"),
        database: config.get<string>("DB_NAME", "message_server"),
        entities: [
          MailJobEntity,
          MailDataEntity,
          MailAttachmentEntity,
          MailSuppressionEntity,
          ProcessedEventEntity,
        ],
        // Schema is owned by migrations only (src/typeorm/migrations) — pending
        // migrations are applied on every boot; never enable synchronize.
        logging: config.get<string>("DB_LOG", "false") === "true",
        migrations: [join(__dirname, "../typeorm/migrations/*{.ts,.js}")],
        migrationsTableName: "migrations_typeorm",
        migrationsRun: true,
      }),
      // Serialize boot migrations across replicas (TypeORM has no built-in
      // migration locking); the helper consumes `migrationsRun`.
      async dataSourceFactory(option) {
        if (!option) throw new Error("Invalid options passed");
        const { migrationsRun, ...dsOption } = option;
        if (migrationsRun) {
          await runMigrationsUnderLock(dsOption as DataSourceOptions);
        }
        return new DataSource(dsOption as DataSourceOptions);
      },
    }),
  ],
})
export class DatabaseModule {}
