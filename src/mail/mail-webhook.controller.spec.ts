import { MailWebhookController } from "./mail-webhook.controller";
import { MailSuppressionService } from "./mail-suppression.service";

describe("MailWebhookController", () => {
  let controller: MailWebhookController;
  let suppression: { add: jest.Mock };
  let events: { publish: jest.Mock };

  beforeEach(() => {
    suppression = { add: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    controller = new MailWebhookController(
      suppression as unknown as MailSuppressionService,
      events as any,
    );
  });

  it("hard bounce: suppresses and publishes mail.bounced", async () => {
    const result = await controller.handle("postmark", {
      event: "bounce",
      email: "Dead@Example.com",
      type: "hard",
      reason: "user unknown",
      messageId: "pm-1",
    } as any);

    expect(result).toEqual({ suppressed: true, published: true });
    expect(suppression.add).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "Dead@Example.com", // lowercased by the suppression service
        reason: "bounce",
        provider: "postmark",
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      "mail.bounced",
      expect.objectContaining({
        email: "Dead@Example.com",
        provider: "postmark",
        type: "hard",
      }),
      { source: "message-server" },
    );
  });

  it("soft bounce: publishes but never suppresses", async () => {
    const result = await controller.handle("ses", {
      event: "bounce",
      email: "a@b.com",
      type: "soft",
      reason: "mailbox full",
    } as any);

    expect(result).toEqual({ suppressed: false, published: true });
    expect(suppression.add).not.toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith(
      "mail.bounced",
      expect.objectContaining({ type: "soft" }),
      { source: "message-server" },
    );
  });

  it("complaint: suppresses and publishes mail.complained", async () => {
    const result = await controller.handle("postmark", {
      event: "complaint",
      email: "angry@example.com",
      reason: "spam report",
    } as any);

    expect(result).toEqual({ suppressed: true, published: true });
    expect(suppression.add).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "angry@example.com",
        reason: "complaint",
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      "mail.complained",
      expect.objectContaining({ email: "angry@example.com" }),
      { source: "message-server" },
    );
  });

  it("unknown provider: accepted no-op (202-style)", async () => {
    const result = await controller.handle("unknown-mailco", {
      event: "bounce",
      email: "a@b.com",
      type: "hard",
    } as any);

    expect(result).toEqual({ suppressed: false, published: false });
    expect(suppression.add).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("a failing bus publication does not block the suppression write", async () => {
    events.publish = jest.fn().mockRejectedValue(new Error("bus down"));

    const result = await controller.handle("smtp", {
      event: "bounce",
      email: "a@b.com",
      type: "hard",
    } as any);

    expect(result).toEqual({ suppressed: true, published: true });
    expect(suppression.add).toHaveBeenCalled();
  });
});
