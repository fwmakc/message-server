import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { MailJobEntity } from "@src/mail/mail-job.entity";
import { ProcessedEventEntity } from "./processed-event.entity";
import {
  WebhookEnvelopeDto,
  UserRegisteredDto,
  UserConfirmedDto,
  PasswordResetDto,
  UserTwoFactorCodeDto,
} from "event-server/contracts";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async handleEvent(event: WebhookEnvelopeDto): Promise<void> {
    this.logger.log(
      `Received event: ${event.pattern} from ${event.source} (eventId=${event.eventId})`,
    );

    switch (event.pattern) {
      case "user.registered":
        await this.processOnce(event, (em, payload) =>
          this.onUserRegistered(em, payload as UserRegisteredDto),
        );
        break;
      case "user.confirmed":
        await this.processOnce(event, (em, payload) =>
          this.onUserConfirmed(payload as UserConfirmedDto),
        );
        break;
      case "password.reset":
        await this.processOnce(event, (em, payload) =>
          this.onPasswordReset(em, payload as PasswordResetDto),
        );
        break;
      case "user.two_factor_code":
        await this.processOnce(event, (em, payload) =>
          this.onUserTwoFactorCode(em, payload as UserTwoFactorCodeDto),
        );
        break;
      default:
        this.logger.warn(`No handler for pattern: ${event.pattern}`);
    }
  }

  /**
   * Marks the event processed and enqueues the side effect (mail job) in
   * ONE transaction: `ON CONFLICT DO NOTHING` on the unique eventId makes
   * a redelivered event a no-op, and the shared transaction means a crash
   * can neither lose the mail nor send it twice.
   */
  private async processOnce(
    event: WebhookEnvelopeDto,
    handler: (em: EntityManager, payload: unknown) => Promise<void>,
  ): Promise<void> {
    const processed = await this.dataSource.transaction(async (em) => {
      const inserted = await em
        .createQueryBuilder()
        .insert()
        .into(ProcessedEventEntity)
        .values({ eventId: String(event.eventId) })
        .orIgnore()
        .returning("id")
        .execute();

      if (inserted.raw.length === 0) return false;

      await handler(em, event.payload);
      return true;
    });

    if (!processed) {
      this.logger.log(
        `Duplicate delivery skipped (eventId=${event.eventId}, pattern=${event.pattern})`,
      );
    }
  }

  private async enqueueTemplate(
    em: EntityManager,
    options: { to: string; subject: string; template: string },
    payload: object,
  ): Promise<void> {
    await em.save(
      em.create(MailJobEntity, {
        data: {
          to: options.to,
          subject: options.subject,
          template: options.template,
          payload,
        },
      } as any),
    );
  }

  private async onUserRegistered(
    em: EntityManager,
    payload: UserRegisteredDto,
  ): Promise<void> {
    const { userId, username, email, subject, confirmUrl } = payload;

    if (!confirmUrl) {
      this.logger.log(
        `User registered (already activated): userId=${userId}, username=${username}`,
      );
      return;
    }

    this.logger.log(
      `Queueing registration email for userId=${userId}, email=${email}`,
    );

    await this.enqueueTemplate(
      em,
      {
        to: email,
        subject: subject || "Registration Confirmation",
        template: "register",
      },
      { url: confirmUrl },
    );
  }

  private async onUserConfirmed(payload: UserConfirmedDto): Promise<void> {
    const { userId, username } = payload;
    this.logger.log(`User confirmed: userId=${userId}, username=${username}`);
  }

  private async onPasswordReset(
    em: EntityManager,
    payload: PasswordResetDto,
  ): Promise<void> {
    const { username, email, subject, resetUrl } = payload;

    this.logger.log(`Queueing password reset email for email=${email}`);

    await this.enqueueTemplate(
      em,
      {
        to: email,
        subject: subject || "Password Reset",
        template: "reset",
      },
      { url: resetUrl },
    );
  }

  private async onUserTwoFactorCode(
    em: EntityManager,
    payload: UserTwoFactorCodeDto,
  ): Promise<void> {
    const { userId, email, code, subject } = payload;

    this.logger.log(
      `Queueing two-factor code email for userId=${userId}, email=${email}`,
    );

    await this.enqueueTemplate(
      em,
      {
        to: email,
        subject: subject || "Your verification code",
        template: "code",
      },
      { code },
    );
  }
}
