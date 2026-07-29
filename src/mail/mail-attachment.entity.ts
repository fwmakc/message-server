import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { MailDataEntity } from "./mail-data.entity";

@Entity("mail_attachments")
export class MailAttachmentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "mail_data_id", type: "int" })
  mailDataId: number;

  @ManyToOne(() => MailDataEntity, (d) => d.attachments)
  mailData: MailDataEntity;

  @Column()
  filename: string;

  @Column({ name: "content_type" })
  contentType: string;

  @Column({ type: "text", nullable: true })
  content?: string;

  @Column({ nullable: true })
  path?: string;
}
