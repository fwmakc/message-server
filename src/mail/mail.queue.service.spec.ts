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
