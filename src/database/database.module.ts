import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MailJobEntity } from "@src/mail/mail-job.entity";
import { MailDataEntity } from "@src/mail/mail-data.entity";
import { MailAttachmentEntity } from "@src/mail/mail-attachment.entity";

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
        password: config.get<string>("DB_PASSWORD", "1234"),
        database: config.get<string>("DB_NAME", "message_server"),
        entities: [MailJobEntity, MailDataEntity, MailAttachmentEntity],
        synchronize: config.get<string>("DB_SYNCHRONIZE", "true") === "true",
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
