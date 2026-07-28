/**
 * T0.15 / P0-G2 — a signature over one `domain` must not verify under any other.
 *
 * `domain` is field 3, inside the signed range, so changing it changes the canonical
 * bytes and the signature stops verifying. That is the mechanism; this is the proof.
 *
 * Why it matters: without it, a signed vote could be replayed as a signed ban. The
 * registry binds each domain to a permission and a credit cost, so lifting a signature
 * from a cheap domain to an expensive one is a privilege-escalation primitive.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §2
 */

import { describe, expect, it } from 'vitest';
import { canonicalBytes } from '../core/canonical.js';
import { contentIdFromCanonical } from '../core/content-id.js';
import { derivePublicKey, sign, verify } from '../crypto/ed25519.js';
import { envelope } from './fixtures.js';

const SEED = new Uint8Array(32).fill(7);
const PUBLIC_KEY = derivePublicKey(SEED);

/** Same author for both halves, so `domain` is the only difference that can matter. */
const a = { ...envelope('domain-separation-a'), author_key: PUBLIC_KEY };
const b = { ...envelope('domain-separation-b'), author_key: PUBLIC_KEY };

describe('domain separation (P0-G2)', () => {
  it('the pair differs only in domain', () => {
    expect(a.domain).not.toBe(b.domain);
    const { domain: _da, ...restA } = a;
    const { domain: _db, ...restB } = b;
    expect({ ...restA, author_key: '' }).toEqual({ ...restB, author_key: '' });
  });

  it('produces different canonical bytes and different content IDs', () => {
    const ca = canonicalBytes(a);
    const cb = canonicalBytes(b);
    expect(ca).not.toEqual(cb);
    expect(contentIdFromCanonical(ca)).not.toBe(contentIdFromCanonical(cb));
  });

  it('a signature over domain A does NOT verify under domain B', () => {
    const signature = sign(canonicalBytes(a), SEED);

    expect(verify(signature, canonicalBytes(a), PUBLIC_KEY)).toBe(true);
    expect(verify(signature, canonicalBytes(b), PUBLIC_KEY)).toBe(false);
  });

  it('and the reverse direction fails too', () => {
    const signature = sign(canonicalBytes(b), SEED);

    expect(verify(signature, canonicalBytes(b), PUBLIC_KEY)).toBe(true);
    expect(verify(signature, canonicalBytes(a), PUBLIC_KEY)).toBe(false);
  });
});
