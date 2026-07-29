/**
 * Every rejection path in the handshake is reachable by a test, and the accept path uses a
 * REAL Ed25519 signature over the real signing bytes — not a stub verifier.
 *
 * A stub that returns true would make this suite pass while a genuine peer's handshake
 * failed in production, which is the class of test this project explicitly does not write.
 */

import { describe, expect, it } from 'vitest';
import { ed25519 } from '@jagoo/sdk/crypto';
import { announceRequestSigningBytes, type AnnounceRequestFields } from '@jagoo/sdk';
import {
  ANNOUNCE_WINDOW_MS,
  checkAnnounce,
  isRoutableEndpointUri,
  MIN_ANNOUNCE_NONCE_BYTES,
} from './announce.js';

const SEED = new Uint8Array(32).fill(21);
const SERVER_KEY = ed25519.derivePublicKey(SEED);
const NOW = 1767225600000;

const verify = (key: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean =>
  ed25519.verify(signature, message, key);

const fields = (over: Partial<AnnounceRequestFields> = {}): AnnounceRequestFields => ({
  serverKey: SERVER_KEY,
  displayName: 'Dhaka Node 1',
  software: 'jagoo-bahee',
  version: '2.0.0',
  endpoints: [
    {
      uri: 'grpc://node-a:8444',
      scope: 3,
      asn: 12345,
      ispName: 'ISP-A',
      region: 'dhaka',
      inboundCapable: true,
      lastOkAtMs: 0n,
      rttMs: 0,
      consecutiveFailures: 0,
    },
  ],
  communities: ['dhaka-relief@jbs1a4f7m2k'],
  channels: [],
  planes: [1],
  acceptedClasses: [1, 2, 3, 4],
  currentSth: undefined,
  timestampMs: BigInt(NOW),
  nonce: new Uint8Array(16).fill(9),
  ...over,
});

const signed = (over: Partial<AnnounceRequestFields> = {}) => {
  const f = fields(over);
  return { fields: f, signature: ed25519.sign(announceRequestSigningBytes(f), SEED) };
};

describe('checkAnnounce', () => {
  it('accepts a genuine handshake', () => {
    expect(checkAnnounce({ ...signed(), nowMs: NOW, verify })).toEqual({ ok: true });
  });

  it('rejects a signature made over different fields', () => {
    const { signature } = signed();
    const result = checkAnnounce({
      fields: fields({ displayName: 'Impostor Node' }),
      signature,
      nowMs: NOW,
      verify,
    });
    expect(result).toEqual({ ok: false, reason: 'announce signature verification failed' });
  });

  it('rejects a key that is not an Ed25519 public key', () => {
    const result = checkAnnounce({
      ...signed(),
      fields: fields({ serverKey: new Uint8Array(16) }),
      nowMs: NOW,
      verify,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a truncated signature before doing any crypto', () => {
    const result = checkAnnounce({
      fields: fields(),
      signature: new Uint8Array(32),
      nowMs: NOW,
      verify: () => {
        throw new Error('verify must not be reached');
      },
    });
    expect(result).toEqual({ ok: false, reason: 'signature is not an Ed25519 signature' });
  });

  it('rejects a nonce too short to prevent replay', () => {
    const result = checkAnnounce({
      ...signed({ nonce: new Uint8Array(MIN_ANNOUNCE_NONCE_BYTES - 1) }),
      nowMs: NOW,
      verify,
    });
    expect(result).toEqual({ ok: false, reason: 'nonce is too short to prevent replay' });
  });

  it('rejects a handshake from the future and one from the past, at the same distance', () => {
    const future = checkAnnounce({ ...signed(), nowMs: NOW - ANNOUNCE_WINDOW_MS - 1, verify });
    const past = checkAnnounce({ ...signed(), nowMs: NOW + ANNOUNCE_WINDOW_MS + 1, verify });
    expect(future).toEqual({ ok: false, reason: 'announce timestamp is in the future' });
    expect(past).toEqual({ ok: false, reason: 'announce timestamp is too old' });
  });

  it('accepts a handshake exactly at the window edge', () => {
    expect(checkAnnounce({ ...signed(), nowMs: NOW - ANNOUNCE_WINDOW_MS, verify }).ok).toBe(true);
    expect(checkAnnounce({ ...signed(), nowMs: NOW + ANNOUNCE_WINDOW_MS, verify }).ok).toBe(true);
  });

  it('rejects a peer that serves no plane (FD-07)', () => {
    const result = checkAnnounce({ ...signed({ planes: [] }), nowMs: NOW, verify });
    expect(result).toEqual({ ok: false, reason: 'peer advertises no planes' });
  });

  it('accepts a peer that advertises no endpoints at all — FD-12 outbound-only', () => {
    expect(checkAnnounce({ ...signed({ endpoints: [] }), nowMs: NOW, verify }).ok).toBe(true);
  });

  it('rejects an endpoint no transport could ever dial', () => {
    const result = checkAnnounce({
      ...signed({
        endpoints: [
          {
            uri: 'javascript:alert(1)',
            scope: 1,
            asn: 0,
            ispName: '',
            region: '',
            inboundCapable: true,
            lastOkAtMs: 0n,
            rttMs: 0,
            consecutiveFailures: 0,
          },
        ],
      }),
      nowMs: NOW,
      verify,
    });
    expect(result.ok).toBe(false);
  });
});

describe('isRoutableEndpointUri', () => {
  it('accepts the schemes this build dials and the ones later phases will', () => {
    for (const uri of [
      'grpc://a:1',
      'grpcs://a:1',
      'https://a',
      'http://a',
      'rns://deadbeef',
      'mesh://peer',
    ]) {
      expect(isRoutableEndpointUri(uri), uri).toBe(true);
    }
  });

  it('rejects empty, unschemed and absurdly long values', () => {
    expect(isRoutableEndpointUri('')).toBe(false);
    expect(isRoutableEndpointUri('node-a:8444')).toBe(false);
    expect(isRoutableEndpointUri(`grpc://${'a'.repeat(600)}`)).toBe(false);
  });
});
