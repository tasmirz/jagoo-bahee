import {
  RequestSecurity,
  type IpBlock,
  type RequestDecision,
  type RequestSubject,
} from '../../../core/ports/request-security.port.js';

export class InMemoryRequestSecurity extends RequestSecurity {
  private readonly counters = new Map<string, { count: number; resetAtMs: number }>();
  private readonly blocked = new Map<string, IpBlock>();

  constructor(
    private limit = 300,
    private readonly windowMs = 60_000,
    private readonly now = () => Date.now(),
  ) {
    super();
  }

  async setLimitPerMinute(value: number): Promise<void> {
    this.limit = value;
  }

  async check(subject: RequestSubject): Promise<RequestDecision> {
    for (const value of [subject.address, subject.subnet]) {
      const block = this.blocked.get(value);
      if (block && (block.expiresAtMs === null || block.expiresAtMs > this.now())) {
        return { allowed: false, remaining: 0, retryAfterMs: this.windowMs, blocked: true };
      }
    }
    const key = subject.address;
    const current = this.counters.get(key);
    const counter =
      !current || current.resetAtMs <= this.now()
        ? { count: 0, resetAtMs: this.now() + this.windowMs }
        : current;
    counter.count += 1;
    this.counters.set(key, counter);
    return {
      allowed: counter.count <= this.limit,
      remaining: Math.max(0, this.limit - counter.count),
      retryAfterMs: Math.max(0, counter.resetAtMs - this.now()),
      blocked: false,
    };
  }

  async blocks(): Promise<readonly IpBlock[]> {
    return [...this.blocked.values()];
  }

  async block(value: IpBlock): Promise<void> {
    this.blocked.set(value.subject, value);
  }

  async unblock(subject: string): Promise<void> {
    this.blocked.delete(subject);
  }
}
