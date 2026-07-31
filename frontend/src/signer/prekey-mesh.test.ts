/**
 * A prekey bundle that arrives over the mesh decides who a FIRST message is encrypted to.
 *
 * ── The attack this must refuse ────────────────────────────────────────────────────
 * Discovery is not authentication: anyone on the Wi-Fi can advertise `_jagoo._tcp` and send
 * frames. If a bundle were cached for the identity key it NAMES rather than the key that
 * SIGNED the envelope carrying it, a stranger could hand out a bundle claiming to be Amina
 * with prekeys they control — and the next first message to Amina would be sealed to the
 * attacker, readable by them and never by her. A full compromise of first contact, from
 * someone on a shared network, with no key ever stolen.
 *
 * The forgery below is a genuinely signed envelope: the attacker's signature over it is
 * valid, so `MeshRouter` would accept and relay it. The identity binding is the only thing
 * standing between that envelope and a redirected conversation.
 */

import { jsCryptoBackend, setCryptoBackend, type CryptoBackend } from '@jagoo/sdk/crypto';
import { PrekeyBundle } from '@jagoo/sdk/proto';
import { loadCachedSignalPrekey } from '../features/signal/storage';
import {
  SecureSignalSigner,
  importSignalIdentity,
  lockSignalIdentity,
  projectLocalSignalEnvelope,
  sealSignalPrekeyEnvelope,
  signalSessionSummary,
} from './signal';

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

const VICTIM_PHRASE = `${'abandon '.repeat(23)}art`;

/** Production scrypt is 64 MiB and this builds several vaults. Still passphrase-dependent. */
const cheapVault: CryptoBackend = {
  ...jsCryptoBackend,
  id: 'cheap-vault',
  scrypt: (password, salt, params) => {
    const material = new Uint8Array(password.length + salt.length);
    material.set(password);
    material.set(salt, password.length);
    return jsCryptoBackend.sha256(material).slice(0, params.dkLen);
  },
};

const bytesOf = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));

describe('prekey bundles over the mesh', () => {
  beforeAll(() => setCryptoBackend(cheapVault));
  afterAll(() => {
    lockSignalIdentity();
    setCryptoBackend(jsCryptoBackend);
  });

  it('caches a genuine bundle under the key that signed it', async () => {
    await importSignalIdentity(VICTIM_PHRASE, '');
    const me = (await signalSessionSummary()).identityKeyHex!;

    // Not addressed to anyone, so nothing is delivered to a thread — false is correct, and
    // the bundle is cached as the side effect that makes first contact possible.
    expect(await projectLocalSignalEnvelope((await sealSignalPrekeyEnvelope()).wireBytes)).toBe(
      false,
    );

    const cached = await loadCachedSignalPrekey(me);
    expect(cached?.identityKey.toLowerCase()).toBe(me.toLowerCase());
    // A bundle in this cache is what lets `startSignalSession` compose with no node.
    expect(cached?.validUntilMs).toBeGreaterThan(Date.now());
  });

  it('refuses a validly-signed bundle whose body claims someone else', async () => {
    await importSignalIdentity(VICTIM_PHRASE, '');
    const victim = (await signalSessionSummary()).identityKeyHex!;
    await projectLocalSignalEnvelope((await sealSignalPrekeyEnvelope()).wireBytes);
    const genuine = await loadCachedSignalPrekey(victim);
    expect(genuine).not.toBeNull();

    // The attacker's own vault — any identity that is not the victim's — and their own real
    // prekey material. `create` with no phrase generates one, which is all this needs.
    const attacker = await SecureSignalSigner.create('');
    try {
      const theirs = PrekeyBundle.decode(await attacker.prekeyBody());
      expect(Buffer.from(theirs.identity_key).toString('hex')).not.toBe(victim);

      // Their material, the victim's name on it. Signed by THEM, so the envelope signature
      // verifies and a relaying peer has no reason to drop it.
      const forgedBody = PrekeyBundle.encode(
        PrekeyBundle.fromPartial({
          identity_key: bytesOf(victim),
          signed_prekey: theirs.signed_prekey,
          signed_prekey_sig: theirs.signed_prekey_sig,
          kem_public_key: theirs.kem_public_key,
          one_time_prekeys: theirs.one_time_prekeys,
          valid_until_ms: theirs.valid_until_ms,
        }),
      ).finish();
      const forged = await attacker.seal(
        { kind: 'device' },
        { domain: 'jb:message:prekeys:v1', body: forgedBody },
      );

      expect(await projectLocalSignalEnvelope(forged.wireBytes)).toBe(false);

      // The decisive assertion: the victim's cached bundle is untouched, so a first message
      // to them is still sealed to THEIR prekey and not to the attacker's.
      const after = await loadCachedSignalPrekey(victim);
      expect(after?.signedPrekey).toBe(genuine?.signedPrekey);
      expect(after?.signedPrekey).not.toBe(
        Buffer.from(theirs.signed_prekey).toString('base64'),
      );
    } finally {
      attacker.lock();
    }
  });
});
