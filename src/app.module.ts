import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "@src/auth/auth.module";
import { MailModule } from "@src/mail/mail.module";
import { EventBusModule } from "@lms/common";
import { EventsController } from "./events.controller";

@Module({
  imports: [ConfigModule.forRoot(), AuthModule, EventBusModule, MailModule],
  controllers: [EventsController],
})
export class AppModule {}