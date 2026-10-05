import { Injectable } from "@nestjs/common";
import { MailerService } from "@nestjs-modules/mailer";
import { OutboundMail } from "./interface/outbound.mail.interface";

export interface MailerSendResult {
  /** Provider-assigned message id (SMTP: nodemailer messageId). */
  providerId: string;
}

/**
 * The outbound boundary of the mail pipeline (design note 7.6 §6): everything
 * upstream (queue, throttle, suppression) works against this interface, so
 * swapping SMTP for a transactional provider (Postmark/SES) touches only the
 * adapter. STRICT contract: resolve = accepted by the transport (the
 * providerId proves it); reject = not sent — the worker retries via its
 * normal attempt/backoff path.
 */
export abstract class MailerAdapter {
  abstract send(mail: OutboundMail): Promise<MailerSendResult>;
}

@Injectable()
export class SmtpMailerAdapter extends MailerAdapter {
  constructor(private readonly mailerService: MailerService) {
    super();
  }

  async send(mail: OutboundMail): Promise<MailerSendResult> {
    // `from` must be omitted, not `from: undefined`: nodemailer merges send
    // options over transport defaults key-by-key, so a present-but-undefined
    // key erases defaults.from and the SMTP conversation degrades to
    // MAIL FROM:<> — rejected by relays with "550 Invalid syntax".
    const result = await this.mailerService.sendMail({
      to: mail.to,
      subject: mail.subject,
      ...(mail.from ? { from: mail.from } : {}),
      text: mail.text,
      html: mail.html,
      template: mail.template,
      context: mail.context,
      attachments: mail.attachments,
    });
    return { providerId: String(result?.messageId ?? "") };
  }
}
