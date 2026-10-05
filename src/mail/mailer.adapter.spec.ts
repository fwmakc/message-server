import { SmtpMailerAdapter } from "./mailer.adapter";
import { OutboundMail } from "./interface/outbound.mail.interface";

// The envelope regression: `from: undefined` in sendMail options overrides
// the transport default ("Test" <noreply@test.local>) with an empty sender,
// so the SMTP conversation opened with MAIL FROM:<> and relays answered
// "550 Invalid syntax in MAIL command" (journal №3, second stacked defect).
// The adapter must omit the key entirely when the job carries no from.
describe("SmtpMailerAdapter", () => {
  const makeAdapter = () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: "<m@test>" });
    const adapter = new SmtpMailerAdapter({ sendMail } as any);
    return { adapter, sendMail };
  };

  const mail = (over: Partial<OutboundMail>): OutboundMail =>
    ({ to: "dest@test.local", subject: "s", text: "hi", ...over }) as OutboundMail;

  it("passes an explicit from through", async () => {
    const { adapter, sendMail } = makeAdapter();
    await adapter.send(mail({ from: "noreply@test.local" }));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "noreply@test.local" }));
  });

  it("omits the from key (not from: undefined) so transport defaults survive", async () => {
    const { adapter, sendMail } = makeAdapter();
    await adapter.send(mail({}));
    const arg = sendMail.mock.calls[0][0];
    expect("from" in arg).toBe(false);
  });

  it("maps the nodemailer messageId to providerId", async () => {
    const { adapter } = makeAdapter();
    await expect(adapter.send(mail({}))).resolves.toEqual({ providerId: "<m@test>" });
  });
});
