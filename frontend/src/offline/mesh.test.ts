import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Plane,
  buildEnvelope,
  canonicalBytes,
  sealEnvelope,
} from '@jagoo/sdk';
import { ed25519 } from '@jagoo/sdk/crypto';
import {
  MeshBloom,
  MeshRouter,
  MeshStore,
  decodeMeshPairing,
  encodeMeshPairing,
  meshEnvelopeFrame,
} from './mesh';

function signedCheckIn() {
  const seed = new Uint8Array(32).fill(7);
  const unsigned = buildEnvelope({
    domain: 'jb:checkin:post:v1',
    plane: Plane.SIGNAL,
    authorKey: ed25519.derivePublicKey(seed),
    body: new Uint8Array([8, 1]),
    nowMs: 1_000n,
    nonce: new Uint8Array(16).fill(3),
  });
  return sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed));
}

describe('offline mesh protocol', () => {
  afterEach(async () => AsyncStorage.clear());

  it('reconciles content IDs with the compact bloom summary', async () => {
    const bloom = new MeshBloom();
    bloom.add('jb1known');
    expect(bloom.has('jb1known')).toBe(true);
    expect(new MeshBloom(bloom.encode()).has('jb1known')).toBe(true);
    const signed = signedCheckIn();
    const store = new MeshStore();
    const router = new MeshRouter(store, async () => true);
    await router.receive(
      'peer-a',
      meshEnvelopeFrame(signed.wireBytes, signed.contentId, 1_000),
      1_001,
    );
    const remoteSummary = {
      version: 1,
      kind: 'summary',
      bloom: bloom.encode(),
      count: 1,
      generatedAtMs: 1_001,
    } as const;
    await expect(router.missingForPeer(remoteSummary)).resolves.toMatchObject([
      { contentId: signed.contentId },
    ]);
    const alreadyKnown = new MeshBloom();
    alreadyKnown.add(signed.contentId);
    await expect(
      router.missingForPeer({ ...remoteSummary, bloom: alreadyKnown.encode() }),
    ).resolves.toEqual([]);
  });

  it('P5-G2 round-trips an expiring QR pairing payload without signalling infrastructure', () => {
    const now = 10_000;
    const encoded = encodeMeshPairing({
      version: 1,
      peerId: 'phone-a',
      role: 'offer',
      sessionDescription: '{"type":"offer","sdp":"local-only"}',
      nonce: '0123456789abcdef',
      expiresAtMs: now + 60_000,
    });
    expect(decodeMeshPairing(encoded, now)).toMatchObject({ peerId: 'phone-a', role: 'offer' });
  });

  it('P5-G3 rejects tampering before storage and produces no relay frame', async () => {
    const signed = signedCheckIn();
    const wire = Uint8Array.from(signed.wireBytes);
    wire[wire.length - 1] = wire[wire.length - 1]! ^ 0xff;
    const store = new MeshStore();
    const router = new MeshRouter(store, async () => true);
    const result = await router.receive(
      'peer-a',
      meshEnvelopeFrame(wire, signed.contentId, 1_000),
      1_001,
    );
    expect(result.ack.status).toBe('rejected');
    expect(result.relay).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('stores a verified envelope once and enforces hop/TTL boundaries', async () => {
    const signed = signedCheckIn();
    const store = new MeshStore();
    const router = new MeshRouter(store, async () => true);
    const frame = meshEnvelopeFrame(signed.wireBytes, signed.contentId, 1_000);
    const first = await router.receive('peer-a', frame, 1_001);
    expect(first.ack.status).toBe('stored');
    expect(first.relay?.hops).toBe(1);
    expect((await router.receive('peer-a', frame, 1_002)).ack.status).toBe('duplicate');
    expect(
      (
        await router.receive(
          'peer-a',
          { ...frame, expiresAtMs: 999 },
          1_003,
        )
      ).ack.status,
    ).toBe('rejected');
  });

  it('isolates a flooding peer at its own hourly quota', async () => {
    const signed = signedCheckIn();
    const router = new MeshRouter(new MeshStore(), async () => true);
    const frame = meshEnvelopeFrame(signed.wireBytes, signed.contentId, 1_000);
    for (let index = 0; index < 1_000; index += 1) {
      const result = await router.receive('flooding-peer', frame, 1_001 + index);
      expect(result.ack.status).not.toBe('rejected');
    }
    const blocked = await router.receive('flooding-peer', frame, 2_002);
    const independent = await router.receive('healthy-peer', frame, 2_002);
    expect(blocked.ack).toMatchObject({ status: 'rejected', error: 'MESH_QUOTA' });
    expect(independent.ack.status).toBe('duplicate');
  });
});
