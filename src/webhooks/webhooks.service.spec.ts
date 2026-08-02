import { WebhooksService } from './webhooks.service';
import { MailQueueService } from '../mail/mail.queue.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mailQueueService: jest.Mocked<Pick<MailQueueService, 'enqueueTemplate'>>;

  beforeEach(() => {
    mailQueueService = {
      enqueueTemplate: jest.fn().mockResolvedValue({ id: 1 }),
    } as any;
    service = new WebhooksService(mailQueueService as any);
  });

  function makeEvent(pattern: string, payload: any) {
    return {
      eventId: 1,
      pattern,
      payload,
      source: 'auth-server',
      timestamp: new Date().toISOString(),
      attempt: 1,
    };
  }

  describe('handleEvent — user.registered', () => {
    it('enqueues template email when confirmUrl is present', async () => {
      await service.handleEvent(
        makeEvent('user.registered', {
          userId: 1,
          username: 'test@example.com',
          email: 'test@example.com',
          subject: 'Welcome!',
          confirmUrl: 'https://app.com/confirm?token=abc',
        }),
      );

      expect(mailQueueService.enqueueTemplate).toHaveBeenCalledWith(
        { to: 'test@example.com', subject: 'Welcome!', template: 'register' },
        { url: 'https://app.com/confirm?token=abc' },
      );
    });

    it('uses default subject when not provided', async () => {
      await service.handleEvent(
        makeEvent('user.registered', {
          userId: 2,
          username: 'test@example.com',
          email: 'test@example.com',
          confirmUrl: 'https://app.com/confirm',
        }),
      );

      expect(mailQueueService.enqueueTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Registration Confirmation' }),
        expect.any(Object),
      );
    });

    it('does NOT enqueue when confirmUrl is missing (already activated)', async () => {
      await service.handleEvent(
        makeEvent('user.registered', {
          userId: 3,
          username: 'test@example.com',
          email: 'test@example.com',
        }),
      );

      expect(mailQueueService.enqueueTemplate).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — password.reset', () => {
    it('enqueues reset email with resetUrl', async () => {
      await service.handleEvent(
        makeEvent('password.reset', {
          username: 'test@example.com',
          email: 'test@example.com',
          subject: 'Reset Your Password',
          resetUrl: 'https://app.com/reset?token=xyz',
        }),
      );

      expect(mailQueueService.enqueueTemplate).toHaveBeenCalledWith(
        { to: 'test@example.com', subject: 'Reset Your Password', template: 'reset' },
        { url: 'https://app.com/reset?token=xyz' },
      );
    });

    it('uses default subject when not provided', async () => {
      await service.handleEvent(
        makeEvent('password.reset', {
          username: 'test@example.com',
          email: 'test@example.com',
          resetUrl: 'https://app.com/reset',
        }),
      );

      expect(mailQueueService.enqueueTemplate).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Password Reset' }),
        expect.any(Object),
      );
    });
  });

  describe('handleEvent — user.confirmed', () => {
    it('does NOT send any email', async () => {
      await service.handleEvent(
        makeEvent('user.confirmed', {
          userId: 4,
          username: 'test@example.com',
          email: 'test@example.com',
        }),
      );

      expect(mailQueueService.enqueueTemplate).not.toHaveBeenCalled();
    });
  });

  describe('handleEvent — unknown pattern', () => {
    it('does NOT enqueue anything', async () => {
      await service.handleEvent(
        makeEvent('unknown.event', { foo: 'bar' }),
      );

      expect(mailQueueService.enqueueTemplate).not.toHaveBeenCalled();
    });
  });
});
