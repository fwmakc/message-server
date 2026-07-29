import { Injectable, Logger } from "@nestjs/common";
import { MailQueueService } from "@src/mail/mail.queue.service";

export interface WebhookEvent {
  eventId: number;
  pattern: string;
  payload: Record<string, any>;
  source: string;
  timestamp: string;
  attempt: number;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly mailQueueService: MailQueueService) {}

  async handleEvent(event: WebhookEvent): Promise<void> {
    this.logger.log(
      `Received event: ${event.pattern} from ${event.source} (eventId=${event.eventId})`
    );

    switch (event.pattern) {
      case "user.registered":
        await this.onUserRegistered(event);
        break;
      case "user.confirmed":
        await this.onUserConfirmed(event);
        break;
      case "password.reset":
        await this.onPasswordReset(event);
        break;
      default:
        this.logger.warn(`No handler for pattern: ${event.pattern}`);
    }
  }

  private async onUserRegistered(event: WebhookEvent): Promise<void> {
    const { userId, username, email, subject, confirmUrl } = event.payload;

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

  private async onUserConfirmed(event: WebhookEvent): Promise<void> {
    const { userId, username } = event.payload;
    this.logger.log(`User confirmed: userId=${userId}, username=${username}`);
  }

  private async onPasswordReset(event: WebhookEvent): Promise<void> {
    const { username, email, subject, resetUrl } = event.payload;

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
