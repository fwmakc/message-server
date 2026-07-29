import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { MailAttachmentEntity } from "./mail-attachment.entity";

@Entity("mail_data")
export class MailDataEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  to: string;

  @Column({ nullable: true })
  from?: string;

  @Column()
  subject: string;

  @Column({ type: "text", nullable: true })
  text?: string;

  @Column({ type: "text", nullable: true })
  html?: string;

  @Column({ nullable: true })
  template?: string;

  @Column({ type: "jsonb", nullable: true })
  payload?: any;

  @OneToMany(() => MailAttachmentEntity, (a) => a.mailData, {
    eager: true,
    cascade: true,
  })
  attachments: MailAttachmentEntity[];
}
