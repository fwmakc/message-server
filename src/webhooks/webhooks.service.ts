import { Injectable, Logger } from "@nestjs/common";
import { MailQueueService } from "@src/mail/mail.queue.service";
import {
  WebhookEnvelopeDto,
  UserRegisteredDto,
  UserConfirmedDto,
  PasswordResetDto,
} from "event-server/contracts";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly mailQueueService: MailQueueService) {}

  async handleEvent(event: WebhookEnvelopeDto): Promise<void> {
    this.logger.log(
      `Received event: ${event.pattern} from ${event.source} (eventId=${event.eventId})`
    );

    switch (event.pattern) {
      case "user.registered":
        await this.onUserRegistered(event.payload as UserRegisteredDto);
        break;
      case "user.confirmed":
        await this.onUserConfirmed(event.payload as UserConfirmedDto);
        break;
      case "password.reset":
        await this.onPasswordReset(event.payload as PasswordResetDto);
        break;
      default:
        this.logger.warn(`No handler for pattern: ${event.pattern}`);
    }
  }

  private async onUserRegistered(payload: UserRegisteredDto): Promise<void> {
    const { userId, username, email, subject, confirmUrl } = payload;

    if (!confirmUrl) {
      this.logger.log(
        `User registered (already activated): userId=${userId}, username=${username}`
      );
      return;
    }

    this.logger.log(
      `Queueing registration email for userId=${userId}, email=${email}`
    );

    await this.mailQueueService.enqueueTemplate(
      {
        to: email,
        subject: subject || "Registration Confirmation",
        template: "register",
      },
      { url: confirmUrl }
    );
  }

  private async onUserConfirmed(payload: UserConfirmedDto): Promise<void> {
    const { userId, username } = payload;
    this.logger.log(`User confirmed: userId=${userId}, username=${username}`);
  }

  private async onPasswordReset(payload: PasswordResetDto): Promise<void> {
    const { username, email, subject, resetUrl } = payload;

    this.logger.log(`Queueing password reset email for email=${email}`);

    await this.mailQueueService.enqueueTemplate(
      {
        to: email,
        subject: subject || "Password Reset",
        template: "reset",
      },
      { url: resetUrl }
    );
  }
}
