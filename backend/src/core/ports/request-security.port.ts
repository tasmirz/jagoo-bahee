export interface RequestSubject {
  readonly address: string;
  readonly subnet: string;
}

export interface RequestDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly blocked: boolean;
}

export interface IpBlock {
  readonly subject: string;
  readonly reason: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number | null;
}

/** Network-only abuse state. It must never receive or persist a Forum identity key. */
export abstract class RequestSecurity {
  abstract check(subject: RequestSubject): Promise<RequestDecision>;
  abstract setLimitPerMinute(value: number): Promise<void>;
  abstract blocks(): Promise<readonly IpBlock[]>;
  abstract block(value: IpBlock): Promise<void>;
  abstract unblock(subject: string): Promise<void>;
}
