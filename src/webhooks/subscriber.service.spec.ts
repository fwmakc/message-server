import { SubscriberService } from './subscriber.service';
import { ConfigService } from '@nestjs/config';

jest.mock('api-server-toolkit/helper', () => ({
  httpPost: jest.fn(),
}));

import { httpPost } from 'api-server-toolkit/helper';

describe('SubscriberService', () => {
  let service: SubscriberService;
  let configService: Partial<Record<string, jest.Mock>>;

  function createService(configValues: Record<string, string> = {}) {
    configService = {
      get: jest.fn((key: string, fallback?: string) => configValues[key] ?? fallback),
    };
    service = new SubscriberService(configService as any);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    createService({
      EVENT_SERVER_URL: 'http://event-server:3005',
      INTERNAL_API_KEY: 'test-key',
      WEBHOOK_URL: 'http://message-server:3003/webhooks/events',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onApplicationBootstrap — success path', () => {
    it('calls httpPost with correct URL, body, and headers', async () => {
      (httpPost as jest.Mock).mockResolvedValue({ status: 200, ok: true });

      await service.onApplicationBootstrap();

      expect(httpPost).toHaveBeenCalledWith(
        'http://event-server:3005/subscribe',
        {
          service: 'message-server',
          url: 'http://message-server:3003/webhooks/events',
          patterns: ['user.registered', 'user.confirmed', 'password.reset'],
          active: true,
        },
        {
          headers: { 'X-Internal-Api-Key': 'test-key' },
          timeout: 5000,
        },
      );
    });

    it('subscribes only once on success', async () => {
      (httpPost as jest.Mock).mockResolvedValue({ status: 200 });

      await service.onApplicationBootstrap();

      expect(httpPost).toHaveBeenCalledTimes(1);
    });
  });

  describe('onApplicationBootstrap — retry with backoff', () => {
    it('retries up to 6 times on failure', async () => {
      jest.useFakeTimers();
      (httpPost as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const promise = service.onApplicationBootstrap();

      // Flush all pending timers (5 retries = 5 setTimeout calls)
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(16000);
      }

      await promise;

      expect(httpPost).toHaveBeenCalledTimes(6);
    });

    it('uses exponential backoff delays (1s, 2s, 4s, 8s, 16s)', async () => {
      jest.useFakeTimers();
      (httpPost as jest.Mock).mockRejectedValue(new Error('fail'));

      const promise = service.onApplicationBootstrap();

      // First attempt fails immediately
      await Promise.resolve();

      // Advance 1s for first retry
      await jest.advanceTimersByTimeAsync(1000);
      expect(httpPost).toHaveBeenCalledTimes(2);

      // Advance 2s for second retry
      await jest.advanceTimersByTimeAsync(2000);
      expect(httpPost).toHaveBeenCalledTimes(3);

      // Advance 4s for third retry
      await jest.advanceTimersByTimeAsync(4000);
      expect(httpPost).toHaveBeenCalledTimes(4);

      // Advance 8s for fourth retry
      await jest.advanceTimersByTimeAsync(8000);
      expect(httpPost).toHaveBeenCalledTimes(5);

      // Advance 16s for fifth retry
      await jest.advanceTimersByTimeAsync(16000);
      expect(httpPost).toHaveBeenCalledTimes(6);

      await promise;
    });

    it('does NOT throw after all retries exhausted', async () => {
      jest.useFakeTimers();
      (httpPost as jest.Mock).mockRejectedValue(new Error('fail'));

      const promise = service.onApplicationBootstrap();
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(16000);
      }

      await expect(promise).resolves.not.toThrow();
    });

    it('stops retrying once successful', async () => {
      jest.useFakeTimers();
      (httpPost as jest.Mock)
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce({ status: 200 });

      const promise = service.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(httpPost).toHaveBeenCalledTimes(2);
    });
  });

  describe('configuration defaults', () => {
    it('uses fallback URLs when env vars are missing', async () => {
      createService({});
      (httpPost as jest.Mock).mockResolvedValue({ status: 200 });

      await service.onApplicationBootstrap();

      expect(httpPost).toHaveBeenCalledWith(
        'http://event-server:3005/subscribe',
        expect.objectContaining({
          url: 'http://message-server:3003/webhooks/events',
        }),
        expect.objectContaining({
          headers: { 'X-Internal-Api-Key': 'changeme' },
        }),
      );
    });
  });
});
