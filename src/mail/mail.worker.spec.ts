import { MailWorker, isHardBounce, isRecipientFatal } from "./mail.worker";
import { MailerAdapter } from "./mailer.adapter";
import { DomainThrottleService } from "./domain-throttle.service";
import { MailSuppressionService } from "./mail-suppression.service";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";

describe("isHardBounce", () => {
  it.each([
    ["550 5.1.1 <a@b.c>: Recipient address rejected", true],
    ["553 5.1.3 Bad mailbox address syntax", true],
    ["554 Delivery error: user unknown", true],
    ["421 4.7.0 Try again later", false],
    ["451 4.4.1 Timeout — deferral", false],
    ["connect ETIMEDOUT", false],
    ["Missing credentials for PLAIN", false],
  ])("classifies %j", (message, hard) => {
    expect(isHardBounce(new Error(message))).toBe(hard);
  });
});

describe("isRecipientFatal", () => {
  it.each([
    ["550 5.1.1 <a@b.c>: Recipient address rejected", true],
    ["554 5.1.1 User unknown in virtual mailbox table", true],
    ["550 5.1.1 No such user here", true],
    ["550 5.2.1 Mailbox disabled / inactive", true],
    [
      // journal №3: an infra-level syntax reply 550s EVERY address —
      // it must classify as retryable, never suppress
      "Mail command failed: 550 Invalid syntax in MAIL command",
      false,
    ],
    ["550 Relay denied for this client", false],
    ["550 Authentication required", false],
    ["550 Blacklisted by spam policy", false],
    ["421 4.7.0 Try again later", false],
  ])("classifies %j", (message, fatal) => {
    expect(isRecipientFatal(new Error(message))).toBe(fatal);
  });
});

describe("MailWorker", () => {
  let worker: MailWorker;
  let repo: jest.Mocked<Pick<Repository<any>, "save" | "findOne">>;
  let mailer: { send: jest.Mock };
  let throttle: { acquire: jest.Mock };
  let suppression: { add: jest.Mock };
  let events: { publish: jest.Mock };

  function createWorker(configValues: Record<string, string> = {}) {
    repo = {
      save: jest.fn(),
      findOne: jest.fn(),
    };
    mailer = { send: jest.fn().mockResolvedValue({ providerId: "m-1" }) };
    throttle = { acquire: jest.fn().mockResolvedValue(undefined) };
    suppression = { add: jest.fn().mockResolvedValue(undefined) };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: jest.fn((key: string, fallback?: any) => {
        const vals: Record<string, any> = {
          WORKER_INTERVAL_MS: 999999,
          BATCH_SIZE: 50,
          MAIL_MAX_ATTEMPTS: 5,
          MAIL_RETRY_DELAY: 5,
          MAIL_CLEANUP_INTERVAL: 999999,
          MAIL_CLEANUP_MAX_AGE_DAYS: 30,
          ...configValues,
        };
        return vals[key] ?? fallback;
      }),
    };
    worker = new MailWorker(
      repo as any,
      mailer as unknown as MailerAdapter,
      throttle as unknown as DomainThrottleService,
      suppression as unknown as MailSuppressionService,
      events as any,
      config as any,
    );
  }

  beforeEach(() => {
    createWorker();
  });

  it("reads MAIL_CONCURRENCY into the queue config", () => {
    createWorker({ MAIL_CONCURRENCY: "7" });
    expect((worker as any).queueConfig.concurrency).toBe(7);
  });

  it("defaults MAIL_CONCURRENCY to 4", () => {
    expect((worker as any).queueConfig.concurrency).toBe(4);
  });

  describe("process — plain email (no template)", () => {
    it("sends through the MailerAdapter with the correct shape", async () => {
      const job = {
        data: {
          to: "user@example.com",
          from: "noreply@example.com",
          subject: "Hello",
          text: "Plain text",
          html: "<p>HTML</p>",
        },
      } as any;

      await (worker as any).process(job);

      expect(throttle.acquire).toHaveBeenCalledWith("user@example.com");
      expect(mailer.send).toHaveBeenCalledWith({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Hello",
        text: "Plain text",
        html: "<p>HTML</p>",
        attachments: undefined,
      });
    });
  });

  describe("process — template email", () => {
    it("sends the template with payload wrapped as context.data", async () => {
      const job = {
        data: {
          to: "user@example.com",
          from: "noreply@example.com",
          subject: "Welcome",
          template: "register",
          payload: { url: "https://app.com/confirm" },
        },
      } as any;

      await (worker as any).process(job);

      expect(mailer.send).toHaveBeenCalledWith({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Welcome",
        template: "register",
        context: { data: { url: "https://app.com/confirm" } },
        attachments: undefined,
      });
    });
  });

  describe("throttle interaction", () => {
    it("lets DomainThrottledError propagate (retryable reschedule)", async () => {
      throttle.acquire = jest.fn().mockRejectedValue(
        Object.assign(new Error("cap"), { name: "DomainThrottledError" }),
      );
      const job = { data: { to: "a@b.com", subject: "X", text: "t" } } as any;

      await expect((worker as any).process(job)).rejects.toThrow("cap");
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe("hard bounce handling", () => {
    it("suppresses and publishes on a 550 reply, then rethrows", async () => {
      mailer.send = jest
        .fn()
        .mockRejectedValue(new Error("550 5.1.1 user unknown"));
      const job = { data: { to: "dead@example.com", subject: "X", text: "t" } } as any;

      await expect((worker as any).process(job)).rejects.toThrow("550");

      expect(suppression.add).toHaveBeenCalledWith(
        expect.objectContaining({ email: "dead@example.com", reason: "bounce" }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        "mail.bounced",
        expect.objectContaining({
          email: "dead@example.com",
          provider: "smtp",
          type: "hard",
        }),
        { source: "message-server" },
      );
    });

    it("does not suppress on transient errors", async () => {
      mailer.send = jest.fn().mockRejectedValue(new Error("421 4.7.0 try later"));
      const job = { data: { to: "a@b.com", subject: "X", text: "t" } } as any;

      await expect((worker as any).process(job)).rejects.toThrow("421");

      expect(suppression.add).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it("does not suppress on an infra-scoped 550 (empty-envelope regression, journal №3)", async () => {
      mailer.send = jest
        .fn()
        .mockRejectedValue(
          new Error("Mail command failed: 550 Invalid syntax in MAIL command"),
        );
      const job = { data: { to: "a@b.com", subject: "X", text: "t" } } as any;

      await expect((worker as any).process(job)).rejects.toThrow("550");

      expect(suppression.add).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it("keeps the job-failure path even when suppression publication fails", async () => {
      mailer.send = jest.fn().mockRejectedValue(new Error("550 mailbox gone"));
      suppression.add = jest.fn().mockRejectedValue(new Error("db down"));
      events.publish = jest.fn().mockRejectedValue(new Error("bus down"));
      const job = { data: { to: "dead@example.com", subject: "X", text: "t" } } as any;

      // rethrow of the ORIGINAL send error, not the suppression failure
      await expect((worker as any).process(job)).rejects.toThrow("550 mailbox gone");
    });
  });

  describe("buildAttachments (via process)", () => {
    it("passes undefined when no attachments", async () => {
      const job = { data: { to: "a@b.com", subject: "X", text: "t" } } as any;
      await (worker as any).process(job);
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: undefined }),
      );
    });

    it("passes undefined when attachments array is empty", async () => {
      const job = {
        data: { to: "a@b.com", subject: "X", text: "t", attachments: [] },
      } as any;
      await (worker as any).process(job);
      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: undefined }),
      );
    });

    it("converts path-based attachments correctly", async () => {
      const job = {
        data: {
          to: "a@b.com",
          subject: "X",
          text: "t",
          attachments: [
            {
              filename: "doc.pdf",
              path: "/tmp/doc.pdf",
              contentType: "application/pdf",
            },
          ],
        },
      } as any;

      await (worker as any).process(job);

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [{ filename: "doc.pdf", contentType: "application/pdf" }],
        }),
      );
    });

    it("converts content-based attachments with base64 encoding", async () => {
      const job = {
        data: {
          to: "a@b.com",
          subject: "X",
          text: "t",
          attachments: [
            {
              filename: "img.png",
              content: "aGVsbG8=",
              contentType: "image/png",
            },
          ],
        },
      } as any;

      await (worker as any).process(job);

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: "img.png",
              content: "aGVsbG8=",
              encoding: "base64",
              contentType: "image/png",
            },
          ],
        }),
      );
    });
  });
});
