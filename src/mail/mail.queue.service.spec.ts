import { BadRequestException } from "@nestjs/common";
import { MailQueueService } from "./mail.queue.service";
import { Repository } from "typeorm";

describe("MailQueueService", () => {
  let service: MailQueueService;
  let repo: jest.Mocked<Pick<Repository<any>, "create" | "save" | "findOne">>;
  let suppression: { find: jest.Mock };

  beforeEach(() => {
    repo = {
      create: jest.fn().mockImplementation((data: any) => data),
      save: jest.fn().mockResolvedValue({ id: 1, status: "pending" }),
      findOne: jest.fn(),
    } as any;
    suppression = { find: jest.fn().mockResolvedValue(null) };
    service = new MailQueueService(repo as any, suppression as any);
  });

  describe("suppression filter", () => {
    it("rejects enqueue to a suppressed recipient", async () => {
      suppression.find = jest
        .fn()
        .mockResolvedValue({ email: "dead@example.com", reason: "bounce" });

      await expect(
        service.enqueueEmail({ to: "dead@example.com", text: "t" } as any),
      ).rejects.toThrow(/suppression list \(bounce\)/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("rejects template enqueue to a suppressed recipient too", async () => {
      suppression.find = jest
        .fn()
        .mockResolvedValue({ email: "angry@example.com", reason: "complaint" });

      await expect(
        service.enqueueTemplate(
          { to: "angry@example.com", template: "register" } as any,
          {},
        ),
      ).rejects.toThrow(/suppression list \(complaint\)/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("passes unsuppressed recipients through", async () => {
      await service.enqueueEmail({ to: "ok@example.com", text: "t" } as any);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe("enqueueEmail", () => {
    it("saves job with correct data shape", async () => {
      await service.enqueueEmail({
        to: "user@example.com",
        from: "noreply@example.com",
        subject: "Hello",
        text: "Plain text",
        html: "<p>HTML</p>",
      } as any);

      expect(repo.save).toHaveBeenCalledWith({
        data: {
          to: "user@example.com",
          from: "noreply@example.com",
          subject: "Hello",
          text: "Plain text",
          html: "<p>HTML</p>",
          attachments: undefined,
        },
      });
    });

    it("includes attachments when provided", async () => {
      const attachments = [
        { filename: "file.pdf", content: "base64", encoding: "base64" },
      ];
      await service.enqueueEmail(
        { to: "user@example.com", subject: "Report", text: "body" } as any,
        attachments as any,
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ attachments }),
      });
    });

    it("returns the saved entity", async () => {
      const result = await service.enqueueEmail({
        to: "user@example.com",
        subject: "Test",
        text: "body",
      } as any);

      expect(result).toEqual({ id: 1, status: "pending" });
    });

    // Journal №3: undeliverable-by-construction letters are rejected at
    // enqueue instead of burning the worker attempt budget.
    it.each([
      ["no content at all", { to: "user@example.com", subject: "x" }],
      ["empty text and html", { to: "u@e.com", text: "", html: "" }],
    ])("rejects mail with %s", async (_label, options) => {
      await expect(service.enqueueEmail(options as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("rejects a template enqueue without a template name", async () => {
      await expect(
        service.enqueueTemplate({ to: "u@e.com", subject: "x" } as any, {}),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("findFailed", () => {
    it("queries failed jobs with pagination and maps a light shape", async () => {
      const job = {
        id: 7,
        attempts: 5,
        errorMessage: "SMTP timeout",
        createdAt: new Date("2026-09-28T10:00:00Z"),
        lastAttemptAt: new Date("2026-09-28T10:05:00Z"),
        data: { to: "user@example.com", subject: "Hello" },
      };
      const getManyAndCount = jest.fn().mockResolvedValue([[job], 1]);
      const chain = {
        where: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount,
      };
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(chain);

      const result = await service.findFailed(2, 10);

      expect((repo as any).createQueryBuilder).toHaveBeenCalledWith("j");
      expect(chain.where).toHaveBeenCalledWith("j.status = :status", {
        status: "failed",
      });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        total: 1,
        page: 2,
        limit: 10,
        data: [
          {
            id: 7,
            to: "user@example.com",
            subject: "Hello",
            attempts: 5,
            errorMessage: "SMTP timeout",
            createdAt: job.createdAt,
            lastAttemptAt: job.lastAttemptAt,
          },
        ],
      });
    });
  });

  describe("requeue", () => {
    let update: jest.Mock;

    beforeEach(() => {
      update = jest.fn().mockResolvedValue({ affected: 1 });
      (repo as any).update = update;
    });

    it("returns null for unknown job", async () => {
      repo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.requeue(99)).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects jobs that are not failed", async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 1, status: "pending" });
      await expect(service.requeue(1)).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it("resets a failed job to pending with a fresh attempt budget", async () => {
      repo.findOne = jest
        .fn()
        .mockResolvedValueOnce({ id: 1, status: "failed", attempts: 5 })
        .mockResolvedValueOnce({ id: 1, status: "pending", attempts: 0 });

      const result = await service.requeue(1);

      expect(update).toHaveBeenCalledWith(1, {
        status: "pending",
        attempts: 0,
        nextAttemptAt: null,
        errorMessage: null,
      });
      expect(result).toEqual({ id: 1, status: "pending", attempts: 0 });
    });
  });

  describe("enqueueTemplate", () => {
    it("saves job with template data shape", async () => {
      await service.enqueueTemplate(
        {
          to: "user@example.com",
          subject: "Welcome",
          template: "register",
        } as any,
        { url: "https://app.com/confirm" },
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: {
          to: "user@example.com",
          from: undefined,
          subject: "Welcome",
          template: "register",
          payload: { url: "https://app.com/confirm" },
          attachments: undefined,
        },
      });
    });

    it("includes attachments when provided", async () => {
      const attachments = [{ filename: "doc.pdf", path: "/tmp/doc.pdf" }];
      await service.enqueueTemplate(
        { to: "user@example.com", subject: "File", template: "file" } as any,
        {},
        attachments as any,
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ attachments }),
      });
    });
  });
});
