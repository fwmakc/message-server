import { ConfigService } from "@nestjs/config";
import {
  DomainThrottleService,
  DomainThrottledError,
} from "./domain-throttle.service";

function configWith(values: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, fallback?: any) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe("DomainThrottleService", () => {
  describe("domainOf", () => {
    it("extracts and lowercases the recipient domain", () => {
      expect(DomainThrottleService.domainOf("User@GMAIL.com")).toBe("gmail.com");
      expect(DomainThrottleService.domainOf("plain")).toBe("plain");
    });
  });

  describe("rateFor", () => {
    it("override wins over the default", () => {
      const svc = new DomainThrottleService(
        configWith({
          MAIL_DOMAIN_RATE_PER_MIN: "100",
          MAIL_DOMAIN_RATE_OVERRIDES: '{"gmail.com":500}',
        }),
      );
      expect(svc.rateFor("gmail.com")).toBe(500);
      expect(svc.rateFor("gov.ru")).toBe(100);
    });

    it("unconfigured = 0 (no throttling)", () => {
      const svc = new DomainThrottleService(configWith());
      expect(svc.rateFor("gmail.com")).toBe(0);
    });

    it("invalid overrides JSON is ignored, not thrown", () => {
      const svc = new DomainThrottleService(
        configWith({ MAIL_DOMAIN_RATE_OVERRIDES: "{not json" }),
      );
      expect(svc.rateFor("gmail.com")).toBe(0);
    });
  });

  describe("acquire", () => {
    it("is a no-op without a cap", async () => {
      const svc = new DomainThrottleService(configWith());
      await expect(svc.acquire("a@b.com")).resolves.toBeUndefined();
    });

    it("drains the bucket, then refuses after the wait budget", async () => {
      const svc = new DomainThrottleService(
        configWith({ MAIL_DOMAIN_THROTTLE_MAX_WAIT_MS: "300" }),
      );
      // rateFor is stubbed to keep the test off the clock: bucket of 2
      // tokens refilled at 0/min.
      jest.spyOn(svc, "rateFor").mockReturnValue(0);

      // rateFor 0 short-circuits as no-cap; emulate a capped domain by
      // calling the private path directly.
      const take = (svc as any).tryTake.bind(svc);
      expect(take("gmail.com", 2)).toBe(true);
      expect(take("gmail.com", 2)).toBe(true);
      expect(take("gmail.com", 2)).toBe(false);
      // refills over time: 0/min means never
      expect(take("gmail.com", 2)).toBe(false);

      // and acquire() surfaces DomainThrottledError through the real path
      const capped = new DomainThrottleService(
        configWith({ MAIL_DOMAIN_THROTTLE_MAX_WAIT_MS: "200" }),
      );
      jest.spyOn(capped, "rateFor").mockReturnValue(1);
      (capped as any).tryTake("gov.ru", 1); // spend the single token
      (capped as any).buckets.get("gov.ru").tokens = 0;
      await expect(capped.acquire("x@gov.ru")).rejects.toThrow(
        DomainThrottledError,
      );
    });

    it("refills continuously up to the per-minute budget", async () => {
      const svc = new DomainThrottleService(configWith());
      const take = (svc as any).tryTake.bind(svc);
      expect(take("gmail.com", 60)).toBe(true);
      // simulate ~1s passing with an emptied bucket: exactly ~1 token back
      const bucket = (svc as any).buckets.get("gmail.com");
      bucket.at -= 1000;
      bucket.tokens = 0;
      expect(take("gmail.com", 60)).toBe(true); // the accrued token
      expect(take("gmail.com", 60)).toBe(false); // budget spent again
    });
  });
});
