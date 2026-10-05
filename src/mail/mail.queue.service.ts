import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QueueService } from "api-server-toolkit";
import { MailJobEntity } from "./mail-job.entity";
import { MailAttachmentEntity } from "./mail-attachment.entity";
import { MailSuppressionService } from "./mail-suppression.service";
import { MailDto } from "./mail.dto";

@Injectable()
export class MailQueueService extends QueueService<MailJobEntity> {
  constructor(
    @InjectRepository(MailJobEntity) repo: Repository<MailJobEntity>,
    private readonly suppression: MailSuppressionService,
  ) {
    super(repo);
  }

  async enqueueEmail(
    options: MailDto,
    attachments?: MailAttachmentEntity[],
  ): Promise<MailJobEntity> {
    // Same rule as the MailDto class validator — programmatic callers skip
    // the HTTP validation pipe, so the guard lives here too (journal №3).
    if (!options.text?.trim() && !options.html?.trim()) {
      throw new BadRequestException(
        "enqueueEmail requires non-empty text or html",
      );
    }
    await this.rejectSuppressed(options.to);
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

  /**
   * Paginated list of failed mail jobs (light shape — no bodies/attachments).
   */
  async findFailed(page = 1, limit = 20) {
    const qb = this.repo
      .createQueryBuilder("j")
      .where("j.status = :status", { status: "failed" })
      .leftJoin("j.data", "d")
      .addSelect(["d.to", "d.subject"])
      .orderBy("j.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [jobs, total] = await qb.getManyAndCount();

    return {
      total,
      page,
      limit,
      data: jobs.map((j) => ({
        id: j.id,
        to: j.data?.to ?? null,
        subject: j.data?.subject ?? null,
        attempts: j.attempts,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
        lastAttemptAt: j.lastAttemptAt,
      })),
    };
  }

  /**
   * Requeue a failed job: the worker picks it up again with a fresh
   * attempt budget. Returns null when the job does not exist.
   */
  async requeue(id: number): Promise<MailJobEntity | null> {
    const job = await this.repo.findOne({ where: { id } as any });
    if (!job) return null;
    if (job.status !== "failed") {
      throw new BadRequestException(
        `Job ${id} is "${job.status}" — only failed jobs can be requeued`,
      );
    }

    await this.repo.update(id, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      errorMessage: null,
    });
    return this.repo.findOne({ where: { id } as any });
  }

  async enqueueTemplate(
    options: MailDto,
    payload: object,
    attachments?: MailAttachmentEntity[],
  ): Promise<MailJobEntity> {
    if (!options.template?.trim()) {
      throw new BadRequestException("enqueueTemplate requires a template name");
    }
    await this.rejectSuppressed(options.to);
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

  /**
   * Hard bounces and complaints poison sender reputation (design note 7.6
   * §5) — a suppressed recipient is rejected at enqueue, before the letter
   * can burn an attempt or a provider complaint threshold.
   */
  private async rejectSuppressed(to: string): Promise<void> {
    const hit = await this.suppression.find(to);
    if (hit) {
      throw new BadRequestException(
        `recipient ${to} is on the suppression list (${hit.reason}); remove the mail_suppressions row to override`,
      );
    }
  }
}
