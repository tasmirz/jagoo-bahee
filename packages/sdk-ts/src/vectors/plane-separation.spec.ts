/**
 * T0.16 / P0-G3 — a FORUM-plane signature must not verify as a SIGNAL-plane envelope.
 *
 * `plane` is field 2, inside the signed range (SEP-02). This is what makes cross-plane
 * replay impossible by construction rather than by a server-side check that a hostile or
 * compromised node could simply skip.
 *
 * Why it matters more than it looks: the two planes exist precisely so that a person's
 * identified broadcast identity cannot be linked to their pseudonymous forum identity.
 * If a FORUM signature could be re-presented as a SIGNAL one, an attacker could take a
 * pseudonymous post and republish it as though it came from that person's *named*
 * channel — collapsing the separation the whole design rests on, in the direction that
 * gets a real person identified.
 *
 * Specification: Plans/01-IDENTITY-PLANES.md §8, Plans/02-CONTRACTS-CORE.md §2
 */

import { describe, expect, it } from 'vitest';
import { canonicalBytes } from '../core/canonical.js';
import { contentIdFromCanonical } from '../core/content-id.js';
import { Plane } from '../core/types.js';
import { derivePublicKey, sign, verify } from '../crypto/ed25519.js';
import { envelope } from './fixtures.js';

const SEED = new Uint8Array(32).fill(11);
const PUBLIC_KEY = derivePublicKey(SEED);

const forum = { ...envelope('plane-separation-forum'), author_key: PUBLIC_KEY };
const signal = { ...envelope('plane-separation-signal'), author_key: PUBLIC_KEY };

describe('plane separation (P0-G3)', () => {
  it('the pair differs only in plane', () => {
    expect(forum.plane).toBe(Plane.FORUM);
    expect(signal.plane).toBe(Plane.SIGNAL);
    const { plane: _pf, ...restForum } = forum;
    const { plane: _ps, ...restSignal } = signal;
    expect(restForum).toEqual(restSignal);
  });

  it('produces different canonical bytes and different content IDs', () => {
    const cf = canonicalBytes(forum);
    const cs = canonicalBytes(signal);
    expect(cf).not.toEqual(cs);
    expect(contentIdFromCanonical(cf)).not.toBe(contentIdFromCanonical(cs));
  });

  it('a FORUM signature does NOT verify as a SIGNAL envelope', () => {
    const forumSignature = sign(canonicalBytes(forum), SEED);

    expect(verify(forumSignature, canonicalBytes(forum), PUBLIC_KEY)).toBe(true);
    expect(verify(forumSignature, canonicalBytes(signal), PUBLIC_KEY)).toBe(false);
  });

  it('and a SIGNAL signature does NOT verify as a FORUM envelope', () => {
    const signalSignature = sign(canonicalBytes(signal), SEED);

    expect(verify(signalSignature, canonicalBytes(signal), PUBLIC_KEY)).toBe(true);
    expect(verify(signalSignature, canonicalBytes(forum), PUBLIC_KEY)).toBe(false);
  });
});
