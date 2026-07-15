import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { MailModule } from "@src/mail/mail.module";
import { EventBusModule } from "@src/event-bus/event-bus.module";
import { EventsController } from "./events.controller";

@Module({
  imports: [ConfigModule.forRoot(), PassportModule, EventBusModule, MailModule],
  controllers: [EventsController],
})
export class AppModule {}
