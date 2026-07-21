import { Injectable, Logger } from "@nestjs/common";

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
    const { userId, username } = event.payload;
    this.logger.log(`User registered: userId=${userId}, username=${username}`);
  }

  private async onUserConfirmed(event: WebhookEvent): Promise<void> {
    const { userId, username } = event.payload;
    this.logger.log(`User confirmed: userId=${userId}, username=${username}`);
  }

  private async onPasswordReset(event: WebhookEvent): Promise<void> {
    const { username } = event.payload;
    this.logger.log(`Password reset requested: username=${username}`);
  }
}
