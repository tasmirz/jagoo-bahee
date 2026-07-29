import { jsCryptoBackend } from '@jagoo/sdk/crypto';
import { compareCryptoBackends } from './parity';

describe('on-device crypto parity harness', () => {
  it('passes every deterministic check when both sides are the JS reference', () => {
    const report = compareCryptoBackends(
      { ...jsCryptoBackend, id: 'candidate-test' },
      jsCryptoBackend,
    );
    expect(report.available).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(18);
    expect(report.checks.every((item) => item.ok)).toBe(true);
  }, 30_000);
});
