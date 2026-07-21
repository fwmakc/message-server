import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class SubscriberService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriberService.name);
  private readonly eventServerUrl: string;
  private readonly apiKey: string;
  private readonly webhookUrl: string;
  private readonly patterns = [
    "user.registered",
    "user.confirmed",
    "password.reset",
  ];

  constructor(private readonly config: ConfigService) {
    this.eventServerUrl = this.config.get<string>(
      "EVENT_SERVER_URL",
      "http://event-server:3005"
    );
    this.apiKey = this.config.get<string>("INTERNAL_API_KEY", "changeme");
    this.webhookUrl = this.config.get<string>(
      "WEBHOOK_URL",
      "http://message-server:3003/webhooks/events"
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.register();
  }

  private async register(retry = 0): Promise<void> {
    try {
      const response = await axios.post(
        `${this.eventServerUrl}/subscribe`,
        {
          service: "message-server",
          url: this.webhookUrl,
          patterns: this.patterns,
          active: true,
        },
        {
          headers: { "X-Internal-Api-Key": this.apiKey },
          timeout: 5000,
        }
      );

      this.logger.log(
        `Subscribed to event-server (patterns: ${this.patterns.join(", ")})`
      );
    } catch (err) {
      if (retry < 5) {
        const delay = Math.pow(2, retry) * 1000;
        this.logger.warn(
          `Failed to subscribe to event-server (attempt ${retry + 1}/6), retrying in ${delay / 1000}s: ${err.message || err}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        await this.register(retry + 1);
      } else {
        this.logger.error(
          `Failed to subscribe to event-server after 6 attempts: ${err.message || err}`
        );
      }
    }
  }
}
