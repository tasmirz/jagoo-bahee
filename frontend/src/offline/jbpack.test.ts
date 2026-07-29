import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plane, buildEnvelope, canonicalBytes, sealEnvelope } from '@jagoo/sdk';
import { ed25519 } from '@jagoo/sdk/crypto';
import { createJbPack, importJbPack, jbpackEnvelopeString } from './jbpack';
import { MeshStore } from './mesh';

function signedEnvelope() {
  const seed = new Uint8Array(32).fill(4);
  const unsigned = buildEnvelope({
    domain: 'jb:checkin:post:v1',
    plane: Plane.SIGNAL,
    authorKey: ed25519.derivePublicKey(seed),
    body: new Uint8Array([8, 1]),
    nowMs: 100n,
    nonce: new Uint8Array(16).fill(1),
  });
  return sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed));
}

describe('.jbpack sneakernet import', () => {
  afterEach(async () => AsyncStorage.clear());

  it('P5-G6 verifies every envelope independently and rejects a tampered member', async () => {
    const signed = signedEnvelope();
    const tampered = Uint8Array.from(signed.wireBytes);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    const bytes = createJbPack([
      { contentId: signed.contentId, envelope: jbpackEnvelopeString(signed.wireBytes) },
      { contentId: `${signed.contentId}bad`, envelope: jbpackEnvelopeString(tampered) },
    ]);
    const store = new MeshStore();
    await expect(importJbPack(bytes, store, async () => true, 200)).resolves.toEqual({
      imported: 1,
      duplicates: 0,
      rejected: 1,
    });
    expect(await store.list()).toHaveLength(1);
  });
});
