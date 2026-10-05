import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MailSuppressionEntity } from "./mail-suppression.entity";

export interface SuppressionInput {
  email: string;
  reason: "bounce" | "complaint";
  provider?: string;
  detail?: string;
}

@Injectable()
export class MailSuppressionService {
  constructor(
    @InjectRepository(MailSuppressionEntity)
    private readonly repo: Repository<MailSuppressionEntity>,
  ) {}

  /**
   * Idempotent add: the first reason wins (a complaint usually follows a
   * bounce for the same address; the event bus carries the full history).
   */
  async add(input: SuppressionInput): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(MailSuppressionEntity)
      .values({
        email: input.email.toLowerCase(),
        reason: input.reason,
        provider: input.provider,
        detail: input.detail,
      })
      .orIgnore()
      .execute();
  }

  find(email: string): Promise<MailSuppressionEntity | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }
}
