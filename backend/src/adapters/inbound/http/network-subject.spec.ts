import { describe, expect, it } from 'vitest';
import { networkSubjects } from './network-subject.js';

describe('rate-limit subject (T1.17)', () => {
  it('P1-G4 — rotating User-Agent cannot affect the subject because it is not an input', () => {
    const first = networkSubjects('203.0.113.9', undefined, 0);
    const rotated = networkSubjects('203.0.113.9', undefined, 0);
    expect(rotated).toEqual(first);
  });

  it('P1-G5 — client-supplied XFF is ignored with no trusted proxy configured', () => {
    const first = networkSubjects('203.0.113.9', '1.1.1.1', 0);
    const second = networkSubjects('203.0.113.9', '8.8.8.8', 0);
    expect(first).toEqual(second);
    expect(first.address).toBe('203.0.113.9');
  });

  it('selects the client immediately left of the configured trusted hops', () => {
    expect(
      networkSubjects('10.0.0.3', '198.51.100.7, 10.0.0.2', 2),
    ).toEqual({ address: '198.51.100.7', subnet: '198.51.100.0/24' });
  });
});
