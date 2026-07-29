import { Injectable } from "@nestjs/common";
import { MailerService } from "@nestjs-modules/mailer";
import { AttachmentsMailInterface } from "./interface/attachments.mail.interface";
import { MailDto } from "./mail.dto";

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async send(options: MailDto, attachments?: AttachmentsMailInterface[]) {
    return await this.mailerService.sendMail({
      to: options.to,
      subject: options.subject,
      attachments,
      text: options.text,
      html: options.html,
    });
  }

  async sendByTemplate(
    options: MailDto,
    data: object,
    attachments?: AttachmentsMailInterface[],
  ) {
    return await this.mailerService.sendMail({
      to: options.to,
      subject: options.subject,
      template: options.template,
      context: { data },
      attachments,
    });
  }
}
