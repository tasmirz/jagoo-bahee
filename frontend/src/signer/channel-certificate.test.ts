/**
 * A broadcast channel signs with its OWN key, so that key needs its own certificate.
 *
 * ── The defect this pins ────────────────────────────────────────────────────────────
 * "Declare identified channel" failed with `could not publish: author key is not certified`.
 * Pipeline step 10 requires the envelope's author key to be certified; `registerSignalIdentity`
 * certifies the DEVICE key; and a channel is signed by a per-channel derived key
 * (Plans/01 §4, `m/83696968'/21'/c'`) that the node has never seen. Nothing certified it, so
 * the declaration was rejected — and so would every broadcast, update, rotation and
 * retirement have been, because all of those are signed by the channel key too.
 *
 * `certificateBody()` was hardcoded to `{ kind: 'device' }`, which is why pointing the
 * existing bootstrap domain at a channel was not merely unimplemented but unexpressible.
 *
 * The backend suite did not catch it: `signalHarness()` seeds a certificate for `AUTHOR_KEY`
 * and then declares a channel whose `signing_key` IS `AUTHOR_KEY`. In the test the channel
 * key and the certified key are the same key, which is the one case the real client never
 * produces.
 */

import {
  ed25519,
  jsCryptoBackend,
  mldsa,
  setCryptoBackend,
  type CryptoBackend,
} from '@jagoo/sdk/crypto';
import { certificateSelfSignatureBytes, pqAttestationBytes, Plane } from '@jagoo/sdk';
import { KeyCertificate } from '@jagoo/sdk/proto';
import { SecureSignalSigner } from './signal';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked',
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

const MNEMONIC = `${'abandon '.repeat(23)}art`;

/** Vault cost is irrelevant here and would allocate the production 64 MiB scrypt area. */
const cheapVault: CryptoBackend = {
  ...jsCryptoBackend,
  id: 'cheap-vault',
  scrypt: (_password, _salt, params) => new Uint8Array(params.dkLen).fill(9),
};

describe('a channel key certifies itself', () => {
  beforeAll(() => setCryptoBackend(cheapVault));
  afterAll(() => setCryptoBackend(jsCryptoBackend));

  it('produces a certificate the node would accept for the CHANNEL key', async () => {
    const signer = await SecureSignalSigner.create('correct horse', MNEMONIC);
    try {
      const channel = await signer.createChannelIdentity();
      const context = { kind: 'channel', channelId: channel.channelId } as const;
      const certificate = KeyCertificate.decode(await signer.certificateBody(context));

      // `SignalKeyCertifyHandler.validate`: "a certificate must be self-published by its own
      // key" — it compares `device_key` against the envelope's author key, which for this
      // context is the channel key.
      expect(Array.from(certificate.device_key)).toEqual(Array.from(channel.publicKey));
      expect(certificate.plane).toBe(2);

      const fields = {
        plane: Plane.SIGNAL,
        deviceKey: certificate.device_key,
        pqKey: certificate.pq_key,
        validFrom: certificate.valid_from,
        validUntil: certificate.valid_until,
      };
      expect(
        mldsa.verifyAttestation(
          certificate.pq_attestation,
          pqAttestationBytes(fields),
          certificate.pq_key,
        ),
      ).toBe(true);
      expect(
        ed25519.verify(
          certificate.self_signature,
          certificateSelfSignatureBytes(fields, certificate.pq_attestation),
          certificate.device_key,
        ),
      ).toBe(true);
    } finally {
      signer.lock();
    }
  });

  /**
   * The two must agree or a channel has two post-quantum identities: subscribers verify
   * against `ChannelDeclare.pq_key` and the node stores the certificate's.
   */
  it('names the same ML-DSA key as the declaration will', async () => {
    const signer = await SecureSignalSigner.create('correct horse', MNEMONIC);
    try {
      const channel = await signer.createChannelIdentity();
      const certificate = KeyCertificate.decode(
        await signer.certificateBody({ kind: 'channel', channelId: channel.channelId }),
      );
      const declared = await signer.channelPqPublicKey(channel.channelId);
      expect(Array.from(certificate.pq_key)).toEqual(Array.from(declared));
    } finally {
      signer.lock();
    }
  });

  /**
   * The gate, failing on purpose (§7.4): the DEVICE certificate — the only one the app used
   * to publish — is about the device key, so it cannot certify a channel. Publishing it and
   * then declaring is exactly the sequence that produced "author key is not certified".
   */
  it('does not certify a channel via the device certificate', async () => {
    const signer = await SecureSignalSigner.create('correct horse', MNEMONIC);
    try {
      const channel = await signer.createChannelIdentity();
      const device = KeyCertificate.decode(await signer.certificateBody());
      expect(Array.from(device.device_key)).not.toEqual(Array.from(channel.publicKey));

      // And the default is still the device, so `registerSignalIdentity` is unchanged.
      const identity = await signer.identity({ kind: 'device' });
      expect(Array.from(device.device_key)).toEqual(Array.from(identity.publicKey));
    } finally {
      signer.lock();
    }
  });
});
