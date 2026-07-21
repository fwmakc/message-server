import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InternalAuthGuard } from "./internal-auth.guard";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { SubscriberService } from "./subscriber.service";

@Module({
  imports: [ConfigModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, SubscriberService, InternalAuthGuard],
})
export class WebhooksModule {}
