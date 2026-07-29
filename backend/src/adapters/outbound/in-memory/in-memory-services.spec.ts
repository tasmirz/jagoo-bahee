import { describe, expect, it } from 'vitest';
import { InMemoryCreditLedger } from './in-memory-services.js';

describe('development anti-abuse adapters', () => {
  it('allows the registry maximum-cost operation from a fresh credit subject', async () => {
    const ledger = new InMemoryCreditLedger();
    const subject = { kind: 'nullifier' as const, value: 'demo' };

    await expect(ledger.consume(subject, 200)).resolves.toMatchObject({
      allowed: true,
      remaining: 50,
    });
    await expect(ledger.consume(subject, 51)).resolves.toMatchObject({
      allowed: false,
      remaining: 50,
    });
  });
});
