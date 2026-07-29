import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { MailModule } from "@src/mail/mail.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { SubscriberService } from "./subscriber.service";

@Module({
  imports: [ConfigModule, MailModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, SubscriberService, InternalAuthGuard],
})
export class WebhooksModule {}
