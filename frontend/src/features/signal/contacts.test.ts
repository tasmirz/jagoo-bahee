import AsyncStorage from '@react-native-async-storage/async-storage';
import { identityId } from '@jagoo/sdk/core';
import { ed25519 } from '@jagoo/sdk/crypto';
import {
  deleteSignalContact,
  findSignalContact,
  loadSignalContacts,
  markSignalContactMessaged,
  saveSignalContact,
  saveSignalContactFromDirectory,
  setSignalContactFollowed,
  verifySignalContact,
  type SignalContact,
} from './contacts';
import { signalTransportBindingBytes, verifySignalIdentity } from './contact-identity';
import type { SignalDirectoryProfile } from './directory';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const base64 = (bytes: Uint8Array): string => globalThis.btoa(String.fromCharCode(...bytes));

/** A profile shaped exactly as the index serves it, signed by a real key. */
function directoryProfile(overrides: Partial<SignalDirectoryProfile> = {}): SignalDirectoryProfile {
  const seed = new Uint8Array(32).fill(7);
  const identityKey = ed25519.derivePublicKey(seed);
  const rnsPublicKey = new Uint8Array(64).fill(3);
  const destination = new Uint8Array(16).fill(9);
  return {
    id: identityId(identityKey),
    codename: identityId(identityKey),
    displayName: 'Amina',
    bio: 'Relief coordinator',
    identityKey: hex(identityKey),
    rnsPublicKey: base64(rnsPublicKey),
    lxmfDestinationHash: hex(destination),
    transportBindingSignature: base64(
      ed25519.sign(signalTransportBindingBytes(rnsPublicKey, destination), seed),
    ),
    claims: [],
    languages: ['bn'],
    revision: '1',
    ...overrides,
  };
}

describe('Signal local contacts', () => {
  afterEach(async () => AsyncStorage.clear());

  it('keeps follows and address book entries device-local', async () => {
    const profile = directoryProfile();
    await saveSignalContactFromDirectory(profile);
    await setSignalContactFollowed(profile.id, true);
    await expect(loadSignalContacts()).resolves.toMatchObject([
      { identityId: profile.id, followed: true },
    ]);
  });

  it('saves the identity key and signed address so the contact verifies with no network', async () => {
    const profile = directoryProfile();
    const { verdict } = await saveSignalContactFromDirectory(profile);
    expect(verdict.ok).toBe(true);

    const saved = await findSignalContact(profile.id);
    expect(saved?.identityKey).toBe(profile.identityKey);
    expect(saved?.transportBindingSignature).toBe(profile.transportBindingSignature);
    expect(saved?.verifiedAtMs).toEqual(expect.any(Number));
    // The whole point: re-verifiable from the stored record alone.
    expect(verifySignalContact(saved as SignalContact)).toEqual({ ok: true });
  });

  it('refuses to save a profile whose address the identity did not sign', async () => {
    const tampered = directoryProfile({ lxmfDestinationHash: 'ff'.repeat(16) });
    const { verdict } = await saveSignalContactFromDirectory(tampered);

    expect(verdict.ok).toBe(false);
    await expect(loadSignalContacts()).resolves.toEqual([]);
  });

  it('saves an unprovable identity only on an explicit acknowledgement, and marks it unverified', async () => {
    const tampered = directoryProfile({ lxmfDestinationHash: 'ff'.repeat(16) });
    const { verdict } = await saveSignalContactFromDirectory(tampered, { allowUnverified: true });

    expect(verdict.ok).toBe(false);
    const saved = await findSignalContact(tampered.id);
    expect(saved?.verifiedAtMs).toBeNull();
  });

  it('preserves a follow and the original save date when a refreshed profile is re-saved', async () => {
    const profile = directoryProfile();
    await saveSignalContactFromDirectory(profile, { followed: true });
    const first = await findSignalContact(profile.id);

    await saveSignalContactFromDirectory({ ...profile, displayName: 'Amina R.' });
    const second = await findSignalContact(profile.id);

    expect(second?.displayName).toBe('Amina R.');
    expect(second?.followed).toBe(true);
    expect(second?.savedAtMs).toBe(first?.savedAtMs);
  });

  it('migrates v2 records in as unverified rather than dropping them', async () => {
    await AsyncStorage.setItem(
      'jb.signal.contacts.v2',
      JSON.stringify([
        {
          identityId: 'jbi1amina',
          displayName: 'Amina',
          lxmfDestinationHash: 'aa'.repeat(16),
          rnsPublicKey: 'AQ==',
          followed: true,
          messagedAtMs: null,
          savedAtMs: 1,
        },
      ]),
    );

    await expect(loadSignalContacts()).resolves.toMatchObject([
      { identityId: 'jbi1amina', followed: true, verifiedAtMs: null, source: 'legacy' },
    ]);
  });

  it('records a send and removes a contact on request', async () => {
    const profile = directoryProfile();
    await saveSignalContactFromDirectory(profile);
    await markSignalContactMessaged(profile.id, 1234);
    await expect(findSignalContact(profile.id)).resolves.toMatchObject({ messagedAtMs: 1234 });

    await deleteSignalContact(profile.id);
    await expect(loadSignalContacts()).resolves.toEqual([]);
  });

  it('rejects an identity id that was not derived from the identity key it ships', () => {
    const profile = directoryProfile({ id: 'jbi1someoneelse' });
    expect(
      verifySignalIdentity({
        identityId: profile.id,
        identityKey: profile.identityKey,
        rnsPublicKey: profile.rnsPublicKey,
        lxmfDestinationHash: profile.lxmfDestinationHash,
        transportBindingSignature: profile.transportBindingSignature,
      }),
    ).toMatchObject({ ok: false });
  });

  it('treats a hand-built contact with no identity material as unverified', async () => {
    const contact: SignalContact = {
      identityId: 'jbi1manual',
      displayName: 'Manual entry',
      bio: '',
      identityKey: '',
      rnsPublicKey: '',
      lxmfDestinationHash: 'bb'.repeat(16),
      transportBindingSignature: '',
      verifiedAtMs: null,
      source: 'manual',
      followed: false,
      messagedAtMs: null,
      savedAtMs: 1,
    };
    await saveSignalContact(contact);
    expect(verifySignalContact(contact)).toMatchObject({ ok: false });
  });
});
