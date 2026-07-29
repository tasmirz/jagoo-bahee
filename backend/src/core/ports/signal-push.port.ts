import type { Severity } from '@jagoo/sdk/proto';

export interface SignalPushAlert {
  readonly channel: string;
  readonly broadcast: string;
  readonly sequence: string;
  readonly severity: Severity;
  readonly headline: string;
  readonly expiresAtMs: number;
}

/**
 * SB-02 delivery boundary. Implementations receive opaque provider tokens only after an
 * explicit signed subscription. The core never knows a provider SDK or device platform.
 */
export abstract class SignalPushGateway {
  abstract deliver(tokens: readonly string[], alert: SignalPushAlert): Promise<void>;
}
