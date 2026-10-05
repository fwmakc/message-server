import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Addresses we must not mail again (design note 7.6 §5): a hard bounce means
 * the mailbox does not exist (or is permanently unavailable), a complaint
 * means the recipient reported spam. Sending to either poisons sender
 * reputation — the fastest route to provider throttling or account
 * suspension. Enqueue to a suppressed address is rejected with 400.
 */
@Entity("mail_suppressions")
@Index("idx_mail_suppressions_email", ["email"], { unique: true })
export class MailSuppressionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column({ type: "varchar" })
  reason: "bounce" | "complaint";

  @Column({ nullable: true })
  provider?: string;

  @Column({ type: "text", nullable: true })
  detail?: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
}
