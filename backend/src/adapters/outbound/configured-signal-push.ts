import { SignalPushGateway, type SignalPushAlert } from '../../core/ports/signal-push.port.js';

/** No-op is the safe default: push is an optional auxiliary delivery path. */
export class NullSignalPushGateway extends SignalPushGateway {
  async deliver(_tokens: readonly string[], _alert: SignalPushAlert): Promise<void> {}
}

/**
 * Provider-neutral HTTPS adapter. Operators own the gateway contract and credentials; Jagoo
 * never logs tokens and never bakes a third-party push vendor into the Signal feature.
 */
export class ConfiguredSignalPushGateway extends SignalPushGateway {
  constructor(
    private readonly endpoint: string,
    private readonly bearerToken: string | undefined,
  ) {
    super();
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new Error('SIGNAL_PUSH_ENDPOINT must use HTTPS outside localhost');
    }
  }

  async deliver(tokens: readonly string[], alert: SignalPushAlert): Promise<void> {
    if (tokens.length === 0) return;
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.bearerToken ? { authorization: `Bearer ${this.bearerToken}` } : {}),
      },
      body: JSON.stringify({ tokens, alert }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`Signal push gateway rejected delivery (${response.status})`);
    }
  }
}
