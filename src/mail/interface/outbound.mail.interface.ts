export interface OutboundMail {
  to: string;
  from?: string;
  subject?: string;
  text?: string;
  html?: string;
  /** Bare template name (EJS adapter resolves it against views/mail). */
  template?: string;
  /** Template variables. */
  context?: object;
  attachments?: {
    filename: string;
    content?: string;
    path?: string;
    encoding?: string;
    contentType?: string;
  }[];
}
