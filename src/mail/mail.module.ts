import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MailerModule } from "@nestjs-modules/mailer";
import { getMailConfig } from "@src/config/mail.config";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { MailJobEntity } from "./mail-job.entity";
import { MailDataEntity } from "./mail-data.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailController } from "./mail.controller";
import { MailService } from "./mail.service";
import { MailQueueService } from "./mail.queue.service";
import { MailWorker } from "./mail.worker";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([MailJobEntity, MailDataEntity, MailAttachmentEntity]),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMailConfig,
    }),
  ],
  controllers: [MailController],
  providers: [MailService, MailQueueService, MailWorker, InternalAuthGuard],
  exports: [MailQueueService],
})
export class MailModule {}
