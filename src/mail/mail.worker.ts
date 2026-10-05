import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { IEventClient, QueueWorker } from "api-server-toolkit";
import { MailJobEntity } from "./mail-job.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailerAdapter, } from "./mailer.adapter";
import { DomainThrottleService } from "./domain-throttle.service";
import { MailSuppressionService } from "./mail-suppression.service";
import { OutboundMail } from "./interface/outbound.mail.interface";
import { AttachmentsMailInterface } from "./interface/attachments.mail.interface";

/**
 * SMTP permanent-failure markers (classic 55x codes or enhanced 5.x.y —
 * the leading 5 means permanent by RFC 3463). Provider adapters report
 * bounce type structurally; this heuristic only covers raw SMTP replies.
 */
export function isHardBounce(err: unknown): boolean {
  const text = [
    (err as { response?: string })?.response,
    (err as Error)?.message,
  ]
    .filter(Boolean)
    .join(" ");
  return /\b55[0-4]\b/.test(text) || /\b5\.\d{1,3}\.\d{1,3}\b/.test(text);
}

@Injectable()
export class MailWorker extends QueueWorker<MailJobEntity> {
  constructor(
    @InjectRepository(MailJobEntity) repo: Repository<MailJobEntity>,
    private readonly mailer: MailerAdapter,
    private readonly throttle: DomainThrottleService,
    private readonly suppression: MailSuppressionService,
    private readonly events: IEventClient,
    config: ConfigService,
  ) {
    super(repo, {
      interval: Number(config.get("WORKER_INTERVAL_MS", 5000)),
      batchSize: Number(config.get("BATCH_SIZE", 50)),
      // Journal №7: the pipeline was sequential end to end (~3-5 mails/s).
      concurrency: Number(config.get("MAIL_CONCURRENCY", 4)),
      maxAttempts: Number(config.get("MAIL_MAX_ATTEMPTS", 5)),
      retryDelay: Number(config.get("MAIL_RETRY_DELAY", 5)),
      cleanup: {
        interval: Number(config.get("MAIL_CLEANUP_INTERVAL", 3600000)),
        maxAgeDays: Number(config.get("MAIL_CLEANUP_MAX_AGE_DAYS", 30)),
        statuses: ["done", "failed"],
      },
    });
  }

  protected loadRelations(qb: SelectQueryBuilder<MailJobEntity>): void {
    qb.leftJoinAndSelect("j.data", "data");
    qb.leftJoinAndSelect("data.attachments", "attachments");
  }

  protected async process(job: MailJobEntity): Promise<void> {
    const d = job.data;

    // Per-recipient-domain cap (7.6 §4): bounded parallelism must not turn
    // into a burst against one big provider. Throws DomainThrottledError —
    // a retryable reschedule — when the domain budget stays empty.
    await this.throttle.acquire(d.to);

    const attachments = this.buildAttachments(d.attachments);
    const mail: OutboundMail = d.template
      ? {
          to: d.to,
          from: d.from,
          subject: d.subject,
          template: d.template,
          context: { data: d.payload },
          attachments,
        }
      : {
          to: d.to,
          from: d.from,
          subject: d.subject,
          text: d.text,
          html: d.html,
          attachments,
        };

    try {
      await this.mailer.send(mail);
    } catch (err) {
      if (isHardBounce(err)) {
        // A 55x/5.x.y reply is definitive: the mailbox will never accept
        // this letter. Suppress before the retry loop burns the remaining
        // attempts, and tell the bus (best-effort — the failed job is the
        // source of truth either way).
        await this.suppression
          .add({
            email: d.to,
            reason: "bounce",
            provider: "smtp",
            detail: (err as Error)?.message?.slice(0, 500),
          })
          .catch(() => undefined);
        await this.events
          .publish(
            "mail.bounced",
            {
              email: d.to,
              provider: "smtp",
              type: "hard",
              reason: (err as Error)?.message?.slice(0, 500),
              bouncedAt: new Date().toISOString(),
            } as unknown as Record<string, unknown>,
            { source: "message-server" },
          )
          .catch(() => undefined);
      }
      throw err;
    }
  }

  private buildAttachments(
    attachments?: MailAttachmentEntity[],
  ): AttachmentsMailInterface[] | undefined {
    if (!attachments?.length) return undefined;

    return attachments.map((a): AttachmentsMailInterface => {
      if (a.path) {
        return {
          filename: a.filename,
          contentType: a.contentType,
        };
      }
      return {
        filename: a.filename,
        content: a.content,
        encoding: "base64",
        contentType: a.contentType,
      };
    });
  }
}
