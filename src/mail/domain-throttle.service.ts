import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export class DomainThrottledError extends Error {
  constructor(
    public readonly domain: string,
    public readonly waitedMs: number,
  ) {
    super(
      `outbound rate cap for domain "${domain}" not drained after ${waitedMs}ms — requeueing`,
    );
    this.name = "DomainThrottledError";
  }
}

interface Bucket {
  /** Token count, fractional (refilled continuously). */
  tokens: number;
  /** Last refill timestamp (ms). */
  at: number;
}

/**
 * Token bucket per RECIPIENT domain (design note 7.6 §4). Big consumer
 * providers throttle per originating IP×domain pair; a burst to one domain
 * must not consume the whole worker's throughput. Rates come from env:
 *
 *   MAIL_DOMAIN_RATE_PER_MIN     — default cap, unset/0 = no throttling
 *   MAIL_DOMAIN_RATE_OVERRIDES   — JSON, e.g. {"gmail.com":500,"gov.ru":30}
 *
 * Honest limitation: the bucket is in-process, so N worker replicas give an
 * aggregate of N×cap. Single-replica deployments are exact; fleet-wide
 * pacing is a Redis upgrade (documented in README), not wired here.
 *
 * acquire() waits up to MAIL_DOMAIN_THROTTLE_MAX_WAIT_MS (default 45s, kept
 * below the queue stale-reclaim window) for a token, then throws
 * DomainThrottledError — a retryable error that reschedules the job without
 * blocking a worker slot on a long queue.
 */
@Injectable()
export class DomainThrottleService {
  private readonly logger = new Logger(DomainThrottleService.name);
  private readonly buckets = new Map<string, Bucket>();
  private readonly defaultPerMin: number;
  private readonly overrides: Record<string, number>;
  private readonly maxWaitMs: number;

  constructor(config: ConfigService) {
    this.defaultPerMin = Number(config.get("MAIL_DOMAIN_RATE_PER_MIN", 0));
    let overrides: Record<string, number> = {};
    const raw = config.get<string>("MAIL_DOMAIN_RATE_OVERRIDES", "");
    if (raw?.trim()) {
      try {
        overrides = JSON.parse(raw);
      } catch {
        this.logger.error(
          "MAIL_DOMAIN_RATE_OVERRIDES is not valid JSON — overrides ignored",
        );
      }
    }
    this.overrides = overrides;
    this.maxWaitMs = Number(
      config.get("MAIL_DOMAIN_THROTTLE_MAX_WAIT_MS", 45000),
    );
  }

  rateFor(domain: string): number {
    if (domain in this.overrides) return Number(this.overrides[domain]);
    return this.defaultPerMin;
  }

  static domainOf(address: string): string {
    const at = address.lastIndexOf("@");
    return (at === -1 ? address : address.slice(at + 1)).toLowerCase();
  }

  /** Resolves when a token is available; rejects with DomainThrottledError
   * when the wait budget is exhausted. No-op when the domain has no cap. */
  async acquire(address: string): Promise<void> {
    const domain = DomainThrottleService.domainOf(address);
    const perMin = this.rateFor(domain);
    if (!perMin || perMin <= 0) return;

    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      if (this.tryTake(domain, perMin)) return;
      if (Date.now() >= deadline) {
        throw new DomainThrottledError(domain, this.maxWaitMs);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  private tryTake(domain: string, perMin: number): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(domain) ?? { tokens: perMin, at: now };
    // Continuous refill; the bucket holds at most one minute of budget.
    bucket.tokens = Math.min(perMin, bucket.tokens + ((now - bucket.at) * perMin) / 60000);
    bucket.at = now;

    if (bucket.tokens < 1) {
      this.buckets.set(domain, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(domain, bucket);
    return true;
  }
}
