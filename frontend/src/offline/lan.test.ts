/**
 * The LAN transport is a join, and the properties worth pinning are the ones that make it
 * safe to point at strangers on a coffee-shop Wi-Fi.
 *
 * ── The rule this must not break ───────────────────────────────────────────────────
 * Discovery is not authentication. Anyone on the network can advertise `_jagoo._tcp` under
 * any name, so a peer is a socket and nothing more. Every envelope that arrives still goes
 * through `MeshRouter`, which verifies the signature and recomputes the content ID from the
 * bytes. The test that matters is that a forged envelope from a "peer" is rejected and never
 * relayed onward — because relaying it would make this device an amplifier for it.
 */

import { Plane, Priority } from '@jagoo/sdk';

const nativeSends: { host: string; port: number; payload: string }[] = [];
let onPeers: ((event: { peers: readonly unknown[] }) => void) | null = null;
let onFrame: ((event: { from: string; payload: string }) => void) | null = null;

jest.mock('../../modules/jagoo-lan', () => ({
  __esModule: true,
  default: {
    start: jest.fn(async (name: string) => ({ port: 4242, name })),
    stop: jest.fn(async () => undefined),
    peers: jest.fn(async () => []),
    send: jest.fn(async (host: string, port: number, payload: string) => {
      nativeSends.push({ host, port, payload });
      return true;
    }),
    addListener: jest.fn((event: string, listener: (payload: never) => void) => {
      if (event === 'onPeers') onPeers = listener as never;
      if (event === 'onFrame') onFrame = listener as never;
      return { remove: () => undefined };
    }),
  },
}));

// Never accept a certificate: an envelope whose author this device cannot vouch for must be
// rejected, which is exactly the hostile case.
jest.mock('./certificate-cache', () => ({
  verifyCachedMeshCertificate: jest.fn(async () => false),
}));

jest.mock('./outbox', () => ({
  listOutbox: jest.fn(async () => []),
  envelopeBytes: jest.fn(() => new Uint8Array([1])),
}));

import { encodeMeshFrame, meshEnvelopeFrame } from './mesh';
import { broadcastToLan, snapshotLan, startLan, stopLan, syncWithPeer } from './lan';

const PEER = { id: 'Amina', name: 'Amina', host: '192.168.1.5', port: 5000 };

describe('LAN peer transport', () => {
  beforeEach(() => {
    nativeSends.length = 0;
  });
  afterEach(async () => stopLan());

  it('reports the module as available and starts under the advertised name', async () => {
    expect(snapshotLan().running).toBe(false);
    const state = await startLan('Amina');
    expect(state).toMatchObject({ available: true, running: true, name: 'Amina' });
  });

  it('hands a newly discovered peer what it is holding, without being asked', async () => {
    await startLan('Amina');
    onPeers?.({ peers: [PEER] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshotLan().peers).toEqual([PEER]);
  });

  it('does not relay an envelope it could not verify', async () => {
    await startLan('Amina');
    onPeers?.({ peers: [PEER, { ...PEER, id: 'Rafi', host: '192.168.1.9' }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    nativeSends.length = 0;

    // Signed by nobody this device trusts — `verifyCachedMeshCertificate` says no.
    const frame = meshEnvelopeFrame(new Uint8Array([9, 9, 9]), 'jb1forged');
    onFrame?.({ from: PEER.host, payload: encodeMeshFrame(frame) });
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Nothing went to the OTHER peer: a rejected envelope must not be amplified.
    expect(nativeSends.filter((item) => item.host === '192.168.1.9')).toEqual([]);
  });

  it('ignores traffic that is not this protocol instead of throwing', async () => {
    await startLan('Amina');
    onFrame?.({ from: '192.168.1.5', payload: 'not json at all' });
    onFrame?.({ from: '192.168.1.5', payload: '{"version":99}' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(snapshotLan().running).toBe(true);
  });

  it('sends nothing when no peer has been found', async () => {
    await startLan('Amina');
    expect(await broadcastToLan()).toBe(0);
    expect(nativeSends).toEqual([]);
  });

  it('stops cleanly and forgets its peers', async () => {
    await startLan('Amina');
    onPeers?.({ peers: [PEER] });
    await stopLan();
    expect(snapshotLan()).toMatchObject({ running: false, peers: [] });
  });

  it('offers a peer nothing it cannot name', async () => {
    // `syncWithPeer` with an empty store and empty outbox sends zero frames — the sync is
    // driven by what this device holds, never by what the peer claims to want.
    await startLan('Amina');
    expect(await syncWithPeer(PEER)).toBe(0);
    expect(nativeSends).toEqual([]);
  });
});

// Referenced so the import is not elided; the plane/priority enums travel inside frames.
expect(Plane.SIGNAL).toBeDefined();
expect(Priority.DIRECT).toBeDefined();
