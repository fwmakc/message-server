import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SentryGlobalFilter } from "@sentry/nestjs/setup";
import { AuthModule } from "@src/auth/auth.module";
import { DatabaseModule } from "@src/database/database.module";
import { MailModule } from "@src/mail/mail.module";
import { WebhooksModule } from "@src/webhooks/webhooks.module";
import { HealthModule } from "@src/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    MailModule,
    WebhooksModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}