import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@src/auth/auth.module";
import { DatabaseModule } from "@src/database/database.module";
import { MailModule } from "@src/mail/mail.module";
import { WebhooksModule } from "@src/webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    MailModule,
    WebhooksModule,
  ],
})
export class AppModule {}