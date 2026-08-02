import { MailWorker } from './mail.worker';
import { MailService } from './mail.service';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';

describe('MailWorker', () => {
  let worker: MailWorker;
  let repo: jest.Mocked<Pick<Repository<any>, 'save' | 'findOne' | 'createQueryBuilder'>>;
  let mailService: jest.Mocked<Pick<MailService, 'send' | 'sendByTemplate'>>;
  let config: Partial<Record<string, jest.Mock>>;

  function createWorker(configValues: Record<string, string> = {}) {
    repo = {
      save: jest.fn(),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    mailService = {
      send: jest.fn().mockResolvedValue(undefined),
      sendByTemplate: jest.fn().mockResolvedValue(undefined),
    };
    config = {
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
    worker = new MailWorker(repo as any, mailService as any, config as any);
  }

  beforeEach(() => {
    createWorker();
  });

  describe('process — plain email (no template)', () => {
    it('calls mailService.send with correct data', async () => {
      const job = {
        data: {
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Hello',
          text: 'Plain text',
          html: '<p>HTML</p>',
        },
      } as any;

      await (worker as any).process(job);

      expect(mailService.send).toHaveBeenCalledWith(
        {
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Hello',
          text: 'Plain text',
          html: '<p>HTML</p>',
        },
        undefined,
      );
    });

    it('does NOT call sendByTemplate when no template', async () => {
      const job = { data: { to: 'a@b.com', subject: 'X' } } as any;
      await (worker as any).process(job);
      expect(mailService.sendByTemplate).not.toHaveBeenCalled();
    });
  });

  describe('process — template email', () => {
    it('calls mailService.sendByTemplate with template and payload', async () => {
      const job = {
        data: {
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Welcome',
          template: 'register',
          payload: { url: 'https://app.com/confirm' },
        },
      } as any;

      await (worker as any).process(job);

      expect(mailService.sendByTemplate).toHaveBeenCalledWith(
        {
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Welcome',
          template: 'register',
        },
        { url: 'https://app.com/confirm' },
        undefined,
      );
    });

    it('does NOT call send when template is set', async () => {
      const job = { data: { to: 'a@b.com', subject: 'X', template: 't' } } as any;
      await (worker as any).process(job);
      expect(mailService.send).not.toHaveBeenCalled();
    });
  });

  describe('buildAttachments (via process)', () => {
    it('passes undefined when no attachments', async () => {
      const job = { data: { to: 'a@b.com', subject: 'X' } } as any;
      await (worker as any).process(job);
      expect(mailService.send).toHaveBeenCalledWith(expect.any(Object), undefined);
    });

    it('passes undefined when attachments array is empty', async () => {
      const job = { data: { to: 'a@b.com', subject: 'X', attachments: [] } } as any;
      await (worker as any).process(job);
      expect(mailService.send).toHaveBeenCalledWith(expect.any(Object), undefined);
    });

    it('converts path-based attachments correctly', async () => {
      const job = {
        data: {
          to: 'a@b.com',
          subject: 'X',
          attachments: [
            { filename: 'doc.pdf', path: '/tmp/doc.pdf', contentType: 'application/pdf' },
          ],
        },
      } as any;

      await (worker as any).process(job);

      expect(mailService.send).toHaveBeenCalledWith(
        expect.any(Object),
        [
          {
            filename: 'doc.pdf',
            contentType: 'application/pdf',
          },
        ],
      );
    });

    it('converts content-based attachments with base64 encoding', async () => {
      const job = {
        data: {
          to: 'a@b.com',
          subject: 'X',
          attachments: [
            { filename: 'img.png', content: 'aGVsbG8=', contentType: 'image/png' },
          ],
        },
      } as any;

      await (worker as any).process(job);

      expect(mailService.send).toHaveBeenCalledWith(
        expect.any(Object),
        [
          {
            filename: 'img.png',
            content: 'aGVsbG8=',
            encoding: 'base64',
            contentType: 'image/png',
          },
        ],
      );
    });
  });
});
