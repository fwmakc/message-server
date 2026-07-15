import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { MailModule } from "@src/mail/mail.module";

@Module({
  imports: [ConfigModule.forRoot(), PassportModule, MailModule],
})
export class AppModule {}
