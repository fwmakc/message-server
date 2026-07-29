import { Entity, JoinColumn, OneToOne } from "typeorm";
import { QueueJobEntity } from "api-server-toolkit";
import { MailDataEntity } from "./mail-data.entity";

@Entity("mail_jobs")
export class MailJobEntity extends QueueJobEntity {
  @OneToOne(() => MailDataEntity, { eager: true, cascade: true })
  @JoinColumn({ name: "data_id" })
  data: MailDataEntity;
}
