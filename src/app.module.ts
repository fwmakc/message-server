import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@src/auth/auth.module";
import { MailModule } from "@src/mail/mail.module";
import { WebhooksModule } from "@src/webhooks/webhooks.module";

@Module({
  imports: [ConfigModule.forRoot(), AuthModule, MailModule, WebhooksModule],
})
export class AppModule {}