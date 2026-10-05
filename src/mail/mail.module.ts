import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MailerModule } from "@nestjs-modules/mailer";
import { EventClientModule } from "api-server-toolkit";
import { getMailConfig } from "@src/config/mail.config";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { MailJobEntity } from "./mail-job.entity";
import { MailDataEntity } from "./mail-data.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailSuppressionEntity } from "./mail-suppression.entity";
import { MailController } from "./mail.controller";
import { MailWebhookController } from "./mail-webhook.controller";
import { MailService } from "./mail.service";
import { MailQueueService } from "./mail.queue.service";
import { MailWorker } from "./mail.worker";
import { MailerAdapter, SmtpMailerAdapter } from "./mailer.adapter";
import { DomainThrottleService } from "./domain-throttle.service";
import { MailSuppressionService } from "./mail-suppression.service";

@Module({
  imports: [
    ConfigModule,
    // IEventClient for the worker's bounce publications and the webhook
    // controller (mail.bounced / mail.complained, v1.4.0 contracts).
    EventClientModule,
    TypeOrmModule.forFeature([
      MailJobEntity,
      MailDataEntity,
      MailAttachmentEntity,
      MailSuppressionEntity,
    ]),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getMailConfig,
    }),
  ],
  controllers: [MailController, MailWebhookController],
  // MailerAdapter is the outbound boundary (7.6 §6): swap the provider by
  // replacing SmtpMailerAdapter — queue, throttle and suppression are
  // provider-agnostic.
  providers: [
    MailService,
    SmtpMailerAdapter,
    { provide: MailerAdapter, useExisting: SmtpMailerAdapter },
    MailSuppressionService,
    DomainThrottleService,
    MailQueueService,
    MailWorker,
    InternalAuthGuard,
  ],
  exports: [MailQueueService, MailSuppressionService],
})
export class MailModule {}
