import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from "@nestjs/common";
import { InternalAuthGuard } from "./internal-auth.guard";
import { WebhooksService, WebhookEvent } from "./webhooks.service";

@Controller("webhooks")
@UseGuards(InternalAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("events")
  @HttpCode(HttpStatus.OK)
  async receiveEvent(@Body() body: WebhookEvent) {
    await this.webhooksService.handleEvent(body);
    return { received: true };
  }
}
