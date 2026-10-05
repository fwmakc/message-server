import { join } from "path";
import { ConfigService } from "@nestjs/config";
import { EjsAdapter } from "@nestjs-modules/mailer/adapters/ejs.adapter";

/**
 * The mailer library's compile hook short-circuits only mails that already
 * carry html and hands everything else to the template adapter — so a
 * plain-text letter crashed EjsAdapter on path.extname(undefined)
 * (journal №3's "The path argument must be of type string"). Pass
 * template-less mail straight through; EJS renders only what names a
 * template.
 */
class SkipTemplatelessAdapter {
  constructor(private readonly inner: EjsAdapter) {}

  compile(mail: any, callback: (err?: Error) => void, mailerOptions: any): void {
    if (!mail?.data?.template) return callback();
    return this.inner.compile(mail, callback, mailerOptions);
  }
}

export const getMailConfig = async (
  configService: ConfigService,
): Promise<any> => {
  const host = configService.get<string>("SMTP_HOST");
  const port = configService.get<string>("SMTP_PORT");
  const user = configService.get<string>("SMTP_USER");
  const password = configService.get<string>("SMTP_PASSWORD");
  const secure = configService.get<string>("SMTP_SECURE") === "true";

  const senderName = configService.get<string>("SMTP_SENDER_NAME");
  const senderEmail = configService.get<string>("SMTP_SENDER_EMAIL");

  const rootPath = configService.get<string>("ROOT_PATH");

  const from = senderName ? `"${senderName}" <${senderEmail}>` : senderEmail;
  // Credentials only when configured: "smtp://:@host" makes nodemailer
  // attempt PLAIN auth with empty credentials and fail with
  // "Missing credentials" — local relays (MailHog) need no auth.
  const credentials = user
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password ?? "")}@`
    : "";
  const transport = `${
    secure ? "smtps" : "smtp"
  }://${credentials}${host}:${port}`;

  return {
    transport,
    defaults: {
      from,
    },
    // preview: true,
    template: {
      dir: join(rootPath, "views/mail"),
      adapter: new SkipTemplatelessAdapter(new EjsAdapter()),
      options: {
        // strict: true,
        strict: false,
      },
    },
  };
};
