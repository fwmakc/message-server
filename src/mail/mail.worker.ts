import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { QueueWorker } from "api-server-toolkit";
import { MailJobEntity } from "./mail-job.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailService } from "./mail.service";
import { AttachmentsMailInterface } from "./interface/attachments.mail.interface";

@Injectable()
export class MailWorker extends QueueWorker<MailJobEntity> {
  constructor(
    @InjectRepository(MailJobEntity) repo: Repository<MailJobEntity>,
    private readonly mailService: MailService,
    config: ConfigService,
  ) {
    super(repo, {
      interval: Number(config.get("WORKER_INTERVAL_MS", 5000)),
      batchSize: Number(config.get("BATCH_SIZE", 50)),
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
    const attachments = this.buildAttachments(d.attachments);

    if (d.template) {
      await this.mailService.sendByTemplate(
        {
          to: d.to,
          from: d.from,
          subject: d.subject,
          template: d.template,
        },
        d.payload,
        attachments,
      );
    } else {
      await this.mailService.send(
        {
          to: d.to,
          from: d.from,
          subject: d.subject,
          text: d.text,
          html: d.html,
        },
        attachments,
      );
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
