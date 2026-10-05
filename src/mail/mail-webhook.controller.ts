import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { IEventClient } from "api-server-toolkit";
import { InternalAuthGuard } from "api-server-toolkit/guard";
import { MailBouncedDto, MailComplainedDto } from "event-server/contracts";
import { MailSuppressionService } from "./mail-suppression.service";
import { MailWebhookDto } from "./mail-webhook.dto";

const PROVIDERS = ["smtp", "postmark", "ses", "sendgrid"];

/**
 * Inbound provider feedback (design note 7.6 §5): hard bounces and
 * complaints land in the suppression list, every event is republished on
 * the bus (contracts mail.bounced / mail.complained) so other services can
 * react. Guarded by the internal key — production provider endpoints are
 * verified per-provider (SNS signing, Postmark webhook secret) by their
 * adapters before this handler runs.
 */
@ApiExcludeController()
@Controller("mail/webhooks")
@UseGuards(InternalAuthGuard)
export class MailWebhookController {
  constructor(
    private readonly suppression: MailSuppressionService,
    private readonly events: IEventClient,
  ) {}

  @Post(":provider")
  async handle(
    @Param("provider") provider: string,
    @Body() body: MailWebhookDto,
  ): Promise<{ suppressed: boolean; published: boolean }> {
    if (!PROVIDERS.includes(provider)) {
      // Unknown provider — accepted but not actionable; 202-style no-op.
      return { suppressed: false, published: false };
    }

    if (body.event === "complaint") {
      await this.suppression.add({
        email: body.email,
        reason: "complaint",
        provider,
        detail: body.reason,
      });
      const payload: MailComplainedDto = {
        email: body.email,
        provider,
        reason: body.reason,
        messageId: body.messageId,
        complainedAt: new Date().toISOString(),
      };
      await this.events
        .publish(
          "mail.complained",
          payload as unknown as Record<string, unknown>,
          { source: "message-server" },
        )
        .catch(() => undefined);
      return { suppressed: true, published: true };
    }

    const type = body.type === "hard" ? "hard" : "soft";
    const bounced: MailBouncedDto = {
      email: body.email,
      provider,
      type,
      reason: body.reason,
      messageId: body.messageId,
      bouncedAt: new Date().toISOString(),
    };
    await this.events
      .publish(
        "mail.bounced",
        bounced as unknown as Record<string, unknown>,
        { source: "message-server" },
      )
      .catch(() => undefined);

    // Soft bounces ride the normal retry path — never suppress (7.6 §5).
    if (type !== "hard") {
      return { suppressed: false, published: true };
    }

    await this.suppression.add({
      email: body.email,
      reason: "bounce",
      provider,
      detail: body.reason,
    });
    return { suppressed: true, published: true };
  }
}
