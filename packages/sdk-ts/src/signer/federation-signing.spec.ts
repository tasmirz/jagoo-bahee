/**
 * The federation handshake signing bytes must be unambiguous.
 *
 * These tests are all the same shape on purpose: take two DIFFERENT payloads that a naive
 * concatenating encoder would render as identical bytes, and require that they do not
 * collide. That is the only property a signature format has to have, and it is exactly the
 * property `frameParts` provides and plain concatenation does not.
 *
 * Governs: FG-01 (Announce/TOFU), FG-08 (STH gossip), T2.13 (directory exchange).
 */

import { describe, expect, it } from 'vitest';
import { ed25519 } from '../crypto/index.js';
import {
  announceRequestSigningBytes,
  announceResponseSigningBytes,
  directoryExchangeSigningBytes,
  serverVouchSigningBytes,
  treeHeadExchangeSigningBytes,
  type AnnounceRequestFields,
  type FederationEndpoint,
} from './federation-signing.js';

const endpoint = (over: Partial<FederationEndpoint> = {}): FederationEndpoint => ({
  uri: 'grpc://node.example.org:8444',
  scope: 1,
  asn: 12345,
  ispName: 'ISP-A',
  region: 'dhaka',
  inboundCapable: true,
  lastOkAtMs: 1767225600000n,
  rttMs: 24,
  consecutiveFailures: 0,
  ...over,
});

const announce = (over: Partial<AnnounceRequestFields> = {}): AnnounceRequestFields => ({
  serverKey: new Uint8Array(32).fill(7),
  displayName: 'Dhaka Node 1',
  software: 'jagoo-bahee',
  version: '2.0.0',
  endpoints: [endpoint()],
  communities: ['dhaka-relief'],
  channels: [],
  planes: [1],
  acceptedClasses: [1, 2, 3, 4],
  currentSth: {
    serverKey: new Uint8Array(32).fill(7),
    treeSize: 12n,
    rootHash: new Uint8Array(32).fill(9),
    timestampMs: 1767225600000n,
    signature: new Uint8Array(64).fill(3),
  },
  timestampMs: 1767225600000n,
  nonce: new Uint8Array(16).fill(4),
  ...over,
});

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('announceRequestSigningBytes', () => {
  it('is deterministic for identical input', () => {
    expect(hex(announceRequestSigningBytes(announce()))).toBe(
      hex(announceRequestSigningBytes(announce())),
    );
  });

  it('does not let a field boundary move without changing the bytes', () => {
    // Concatenation would render both as "…jagoo-baheeX2.0.0…" for some split.
    const a = announceRequestSigningBytes(announce({ software: 'jagoo', version: 'bahee2.0.0' }));
    const b = announceRequestSigningBytes(announce({ software: 'jagoobahee', version: '2.0.0' }));
    expect(hex(a)).not.toBe(hex(b));
  });

  it('does not let a repeated-field boundary move', () => {
    const a = announceRequestSigningBytes(announce({ communities: ['ab', 'c'] }));
    const b = announceRequestSigningBytes(announce({ communities: ['a', 'bc'] }));
    const c = announceRequestSigningBytes(announce({ communities: ['abc'] }));
    expect(new Set([hex(a), hex(b), hex(c)]).size).toBe(3);
  });

  it('distinguishes an absent tree head from a zero-size one', () => {
    const absent = announceRequestSigningBytes(announce({ currentSth: undefined }));
    const empty = announceRequestSigningBytes(
      announce({
        currentSth: {
          serverKey: new Uint8Array(0),
          treeSize: 0n,
          rootHash: new Uint8Array(0),
          timestampMs: 0n,
          signature: new Uint8Array(0),
        },
      }),
    );
    expect(hex(absent)).not.toBe(hex(empty));
  });

  it('covers every endpoint field, including the mutable observations', () => {
    const base = announceRequestSigningBytes(announce());
    const variants: Partial<FederationEndpoint>[] = [
      { uri: 'grpc://other.example.org:8444' },
      { scope: 3 },
      { asn: 67890 },
      { ispName: 'ISP-B' },
      { region: 'chittagong' },
      { inboundCapable: false },
      { lastOkAtMs: 1767225600001n },
      { rttMs: 25 },
      { consecutiveFailures: 1 },
    ];
    for (const change of variants) {
      expect(
        hex(announceRequestSigningBytes(announce({ endpoints: [endpoint(change)] }))),
        `endpoint field ${Object.keys(change)[0]} is not covered by the signature`,
      ).not.toBe(hex(base));
    }
  });

  it('normalises display names to NFC, so one node has one identity string', () => {
    const composed = announceRequestSigningBytes(announce({ displayName: 'Café Node' }));
    const decomposed = announceRequestSigningBytes(announce({ displayName: 'Café Node' }));
    expect(hex(composed)).toBe(hex(decomposed));
  });

  it('round-trips through a real Ed25519 signature', () => {
    const seed = new Uint8Array(32).fill(11);
    const key = ed25519.derivePublicKey(seed);
    const bytes = announceRequestSigningBytes(announce({ serverKey: key }));
    const signature = ed25519.sign(bytes, seed);
    expect(ed25519.verify(signature, bytes, key)).toBe(true);

    const tampered = announceRequestSigningBytes(announce({ serverKey: key, displayName: 'Evil' }));
    expect(ed25519.verify(signature, tampered, key)).toBe(false);
  });
});

describe('the other four payloads', () => {
  it('use distinct domain-separation prefixes, so one cannot verify as another', () => {
    const key = new Uint8Array(32).fill(7);
    const prefixes = [
      announceRequestSigningBytes(announce()),
      announceResponseSigningBytes({
        serverKey: key,
        assigned: 2,
        endpoints: [],
        vouches: [],
        grantedQuota: undefined,
        currentSth: undefined,
      }),
      serverVouchSigningBytes({ peerKey: key, level: 3, note: '', assertedAtMs: 1n }),
      treeHeadExchangeSigningBytes({ serverKey: key, sth: undefined, observed: [] }),
      directoryExchangeSigningBytes({ peers: [], generatedAtMs: 1n }),
    ].map((bytes) => hex(bytes.subarray(0, 32)));
    expect(new Set(prefixes).size).toBe(5);
  });

  it('separates a vouch level from the note that follows it', () => {
    const key = new Uint8Array(32).fill(7);
    const a = serverVouchSigningBytes({ peerKey: key, level: 3, note: 'ok', assertedAtMs: 10n });
    const b = serverVouchSigningBytes({ peerKey: key, level: 30, note: 'k', assertedAtMs: 10n });
    expect(hex(a)).not.toBe(hex(b));
  });

  it('covers each observation in an STH gossip exchange', () => {
    const key = new Uint8Array(32).fill(7);
    const sth = {
      serverKey: key,
      treeSize: 5n,
      rootHash: new Uint8Array(32).fill(1),
      timestampMs: 100n,
      signature: new Uint8Array(64).fill(2),
    };
    const one = treeHeadExchangeSigningBytes({
      serverKey: key,
      sth,
      observed: [{ peerKey: new Uint8Array(32).fill(8), sth, observedAtMs: 100n }],
    });
    const two = treeHeadExchangeSigningBytes({
      serverKey: key,
      sth,
      observed: [
        { peerKey: new Uint8Array(32).fill(8), sth, observedAtMs: 100n },
        { peerKey: new Uint8Array(32).fill(9), sth, observedAtMs: 100n },
      ],
    });
    expect(hex(one)).not.toBe(hex(two));
  });

  it('covers a peer record’s trust level and scoped endpoints in a directory exchange', () => {
    const record = {
      serverKey: new Uint8Array(32).fill(7),
      displayName: 'Dhaka Node 1',
      endpoints: [endpoint()],
      trust: 2,
      vouchedBy: [],
      communities: [],
      channels: [],
      planes: [1],
      isBridge: false,
      bridgedAsns: [],
      lastSeenMs: 1n,
    };
    const base = directoryExchangeSigningBytes({ peers: [record], generatedAtMs: 1n });
    const promoted = directoryExchangeSigningBytes({
      peers: [{ ...record, trust: 4 }],
      generatedAtMs: 1n,
    });
    const rescoped = directoryExchangeSigningBytes({
      peers: [{ ...record, endpoints: [endpoint({ scope: 3 })] }],
      generatedAtMs: 1n,
    });
    expect(new Set([hex(base), hex(promoted), hex(rescoped)]).size).toBe(3);
  });
});
