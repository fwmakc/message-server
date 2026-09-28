import { BadRequestException } from '@nestjs/common';
import { MailQueueService } from './mail.queue.service';
import { Repository } from 'typeorm';

describe('MailQueueService', () => {
  let service: MailQueueService;
  let repo: jest.Mocked<Pick<Repository<any>, 'create' | 'save' | 'findOne'>>;

  beforeEach(() => {
    repo = {
      create: jest.fn().mockImplementation((data: any) => data),
      save: jest.fn().mockResolvedValue({ id: 1, status: 'pending' }),
      findOne: jest.fn(),
    } as any;
    service = new MailQueueService(repo as any);
  });

  describe('enqueueEmail', () => {
    it('saves job with correct data shape', async () => {
      await service.enqueueEmail({
        to: 'user@example.com',
        from: 'noreply@example.com',
        subject: 'Hello',
        text: 'Plain text',
        html: '<p>HTML</p>',
      } as any);

      expect(repo.save).toHaveBeenCalledWith({
        data: {
          to: 'user@example.com',
          from: 'noreply@example.com',
          subject: 'Hello',
          text: 'Plain text',
          html: '<p>HTML</p>',
          attachments: undefined,
        },
      });
    });

    it('includes attachments when provided', async () => {
      const attachments = [{ filename: 'file.pdf', content: 'base64', encoding: 'base64' }];
      await service.enqueueEmail(
        { to: 'user@example.com', subject: 'Report' } as any,
        attachments as any,
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ attachments }),
      });
    });

    it('returns the saved entity', async () => {
      const result = await service.enqueueEmail({
        to: 'user@example.com',
        subject: 'Test',
      } as any);

      expect(result).toEqual({ id: 1, status: 'pending' });
    });
  });

  describe('findFailed', () => {
    it('queries failed jobs with pagination and maps a light shape', async () => {
      const job = {
        id: 7,
        attempts: 5,
        errorMessage: 'SMTP timeout',
        createdAt: new Date('2026-09-28T10:00:00Z'),
        lastAttemptAt: new Date('2026-09-28T10:05:00Z'),
        data: { to: 'user@example.com', subject: 'Hello' },
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

      expect((repo as any).createQueryBuilder).toHaveBeenCalledWith('j');
      expect(chain.where).toHaveBeenCalledWith('j.status = :status', { status: 'failed' });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({
        total: 1,
        page: 2,
        limit: 10,
        data: [
          {
            id: 7,
            to: 'user@example.com',
            subject: 'Hello',
            attempts: 5,
            errorMessage: 'SMTP timeout',
            createdAt: job.createdAt,
            lastAttemptAt: job.lastAttemptAt,
          },
        ],
      });
    });
  });

  describe('requeue', () => {
    let update: jest.Mock;

    beforeEach(() => {
      update = jest.fn().mockResolvedValue({ affected: 1 });
      (repo as any).update = update;
    });

    it('returns null for unknown job', async () => {
      repo.findOne = jest.fn().mockResolvedValue(null);
      await expect(service.requeue(99)).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects jobs that are not failed', async () => {
      repo.findOne = jest.fn().mockResolvedValue({ id: 1, status: 'pending' });
      await expect(service.requeue(1)).rejects.toThrow(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('resets a failed job to pending with a fresh attempt budget', async () => {
      repo.findOne = jest
        .fn()
        .mockResolvedValueOnce({ id: 1, status: 'failed', attempts: 5 })
        .mockResolvedValueOnce({ id: 1, status: 'pending', attempts: 0 });

      const result = await service.requeue(1);

      expect(update).toHaveBeenCalledWith(1, {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: null,
        errorMessage: null,
      });
      expect(result).toEqual({ id: 1, status: 'pending', attempts: 0 });
    });
  });

  describe('enqueueTemplate', () => {
    it('saves job with template data shape', async () => {
      await service.enqueueTemplate(
        { to: 'user@example.com', subject: 'Welcome', template: 'register' } as any,
        { url: 'https://app.com/confirm' },
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: {
          to: 'user@example.com',
          from: undefined,
          subject: 'Welcome',
          template: 'register',
          payload: { url: 'https://app.com/confirm' },
          attachments: undefined,
        },
      });
    });

    it('includes attachments when provided', async () => {
      const attachments = [{ filename: 'doc.pdf', path: '/tmp/doc.pdf' }];
      await service.enqueueTemplate(
        { to: 'user@example.com', subject: 'File', template: 'file' } as any,
        {},
        attachments as any,
      );

      expect(repo.save).toHaveBeenCalledWith({
        data: expect.objectContaining({ attachments }),
      });
    });
  });
});
