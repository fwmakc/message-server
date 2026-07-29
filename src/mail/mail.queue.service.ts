import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QueueService } from "api-server-toolkit";
import { MailJobEntity } from "./mail-job.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailDto } from "./mail.dto";

@Injectable()
export class MailQueueService extends QueueService<MailJobEntity> {
  constructor(
    @InjectRepository(MailJobEntity) repo: Repository<MailJobEntity>,
  ) {
    super(repo);
  }

  async enqueueEmail(
    options: MailDto,
    attachments?: MailAttachmentEntity[],
  ): Promise<MailJobEntity> {
    return this.enqueue({
      data: {
        to: options.to,
        from: options.from,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments,
      },
    } as any);
  }

  async enqueueTemplate(
    options: MailDto,
    payload: object,
    attachments?: MailAttachmentEntity[],
  ): Promise<MailJobEntity> {
    return this.enqueue({
      data: {
        to: options.to,
        from: options.from,
        subject: options.subject,
        template: options.template,
        payload,
        attachments,
      },
    } as any);
  }
}
