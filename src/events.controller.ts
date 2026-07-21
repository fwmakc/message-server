import { Controller } from "@nestjs/common";
import { EventPattern } from "@nestjs/microservices";
import { MailService } from "@src/mail/mail.service";
import {
  EventBusEnvelope,
  EventBusPattern,
} from "@core/common";

@Controller()
export class EventsController {
  constructor(private readonly mailService: MailService) {}

  @EventPattern(EventBusPattern.USER_REGISTERED)
  async handleUserRegistered(envelope: EventBusEnvelope) {
    console.log(`[EVENT] ${envelope.pattern} from ${envelope.source}`);
  }

  @EventPattern(EventBusPattern.PASSWORD_RESET)
  async handlePasswordReset(envelope: EventBusEnvelope) {
    console.log(`[EVENT] ${envelope.pattern} from ${envelope.source}`);
  }

  @EventPattern(EventBusPattern.USER_CONFIRMED)
  async handleUserConfirmed(envelope: EventBusEnvelope) {
    console.log(`[EVENT] ${envelope.pattern} from ${envelope.source}`);
  }
}