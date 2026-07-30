/**
 * The device-local Signal address book.
 *
 * This is the store that decides whether messaging survives a shutdown. Knowing someone's
 * name is not knowing their identity: to reach a person over LXMF when no index is
 * reachable, the device needs their identity key and the delivery address that key signed,
 * held locally, before the network goes. Saving a contact is therefore an explicit act with
 * a durable result, not a side effect of having once messaged them.
 *
 * Two properties are load-bearing:
 *
 *   - **Every record carries its own proof.** `identityKey` and `transportBindingSignature`
 *     are stored beside the address, so `verifySignalIdentity` can re-derive the whole claim
 *     from the record alone, with no network and no index. A contact saved today is still
 *     verifiable during a blackout next month.
 *   - **Contacts and follows never leave the device.** No subscription graph is sent to the
 *     index. A server-side list of who talks to whom is a list of targets, which is why
 *     broadcasts flood and the client filters locally.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifySignalIdentity, type SignalIdentityVerdict } from './contact-identity';
import type { SignalDirectoryProfile } from './directory';

const CONTACTS_KEY = 'jb.signal.contacts.v3';
/** v2 held no identity material, so its records migrate in as unverified rather than lost. */
const LEGACY_CONTACTS_KEY = 'jb.signal.contacts.v2';

export interface SignalContact {
  readonly identityId: string;
  readonly displayName: string;
  readonly bio: string;
  /** Ed25519 identity key, hex. Empty on records that predate offline verification. */
  readonly identityKey: string;
  readonly rnsPublicKey: string;
  readonly lxmfDestinationHash: string;
  readonly transportBindingSignature: string;
  /**
   * When the identity last verified ON THIS DEVICE. `null` means it never has — the record
   * is still usable, and the UI must say plainly that it is unproven.
   */
  readonly verifiedAtMs: number | null;
  readonly source: 'directory' | 'manual' | 'legacy';
  readonly followed: boolean;
  readonly messagedAtMs: number | null;
  readonly savedAtMs: number;
}

function hydrate(row: Record<string, unknown>): SignalContact {
  return {
    identityId: String(row['identityId'] ?? ''),
    displayName: String(row['displayName'] ?? ''),
    bio: String(row['bio'] ?? ''),
    identityKey: String(row['identityKey'] ?? ''),
    rnsPublicKey: String(row['rnsPublicKey'] ?? ''),
    lxmfDestinationHash: String(row['lxmfDestinationHash'] ?? ''),
    transportBindingSignature: String(row['transportBindingSignature'] ?? ''),
    verifiedAtMs: typeof row['verifiedAtMs'] === 'number' ? (row['verifiedAtMs'] as number) : null,
    source: (row['source'] as SignalContact['source']) ?? 'legacy',
    followed: row['followed'] === true,
    messagedAtMs: typeof row['messagedAtMs'] === 'number' ? (row['messagedAtMs'] as number) : null,
    savedAtMs: typeof row['savedAtMs'] === 'number' ? (row['savedAtMs'] as number) : Date.now(),
  };
}

async function load(): Promise<readonly SignalContact[]> {
  try {
    const current = await AsyncStorage.getItem(CONTACTS_KEY);
    if (current) return (JSON.parse(current) as Record<string, unknown>[]).map(hydrate);
    const legacy = await AsyncStorage.getItem(LEGACY_CONTACTS_KEY);
    if (!legacy) return [];
    const migrated = (JSON.parse(legacy) as Record<string, unknown>[]).map(hydrate);
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

async function persist(contacts: readonly SignalContact[]): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export async function loadSignalContacts(): Promise<readonly SignalContact[]> {
  return load();
}

export async function findSignalContact(identityId: string): Promise<SignalContact | null> {
  return (await load()).find((contact) => contact.identityId === identityId) ?? null;
}

/**
 * Upsert a contact, preserving what the device already decided about them.
 *
 * A re-save from a refreshed directory result must not silently drop a follow or reset the
 * date it was first saved — those are the user's state, not the index's.
 */
export async function saveSignalContact(contact: SignalContact): Promise<void> {
  const contacts = await load();
  const existing = contacts.find((row) => row.identityId === contact.identityId);
  const merged: SignalContact = existing
    ? {
        ...contact,
        followed: contact.followed || existing.followed,
        messagedAtMs: contact.messagedAtMs ?? existing.messagedAtMs,
        savedAtMs: existing.savedAtMs,
      }
    : contact;
  await persist([...contacts.filter((row) => row.identityId !== contact.identityId), merged]);
}

export interface SaveDirectoryContactResult {
  readonly contact: SignalContact;
  readonly verdict: SignalIdentityVerdict;
}

/**
 * Save a discovered profile for offline use.
 *
 * Verification runs first and the verdict is RETURNED rather than thrown: refusing outright
 * would mean an index that does not yet publish binding material makes its own users
 * permanently unreachable. `allowUnverified` is the caller's explicit acknowledgement, and
 * the stored record keeps `verifiedAtMs: null` so that both the contact list and the send
 * path keep saying so.
 */
export async function saveSignalContactFromDirectory(
  profile: SignalDirectoryProfile,
  options: { readonly allowUnverified?: boolean; readonly followed?: boolean } = {},
): Promise<SaveDirectoryContactResult> {
  const verdict = verifySignalIdentity({
    identityId: profile.id,
    identityKey: profile.identityKey,
    rnsPublicKey: profile.rnsPublicKey,
    lxmfDestinationHash: profile.lxmfDestinationHash,
    transportBindingSignature: profile.transportBindingSignature,
  });

  const contact: SignalContact = {
    identityId: profile.id,
    displayName: profile.displayName,
    bio: profile.bio,
    identityKey: profile.identityKey,
    rnsPublicKey: profile.rnsPublicKey,
    lxmfDestinationHash: profile.lxmfDestinationHash,
    transportBindingSignature: profile.transportBindingSignature,
    verifiedAtMs: verdict.ok ? Date.now() : null,
    source: 'directory',
    followed: options.followed ?? false,
    messagedAtMs: null,
    savedAtMs: Date.now(),
  };

  if (verdict.ok || options.allowUnverified) await saveSignalContact(contact);
  return { contact, verdict };
}

export async function setSignalContactFollowed(
  identityId: string,
  followed: boolean,
): Promise<void> {
  const contacts = await load();
  await persist(
    contacts.map((contact) =>
      contact.identityId === identityId ? { ...contact, followed } : contact,
    ),
  );
}

export async function markSignalContactMessaged(
  identityId: string,
  messagedAtMs = Date.now(),
): Promise<void> {
  const contacts = await load();
  await persist(
    contacts.map((contact) =>
      contact.identityId === identityId ? { ...contact, messagedAtMs } : contact,
    ),
  );
}

export async function deleteSignalContact(identityId: string): Promise<void> {
  const contacts = await load();
  await persist(contacts.filter((contact) => contact.identityId !== identityId));
}

/**
 * Re-verify a saved contact immediately before it is used.
 *
 * The check at save time proved the index was honest then. This one proves the local record
 * has not been altered since — a tampered device store is a cheaper target than the index,
 * and one signature verification costs nothing next to messaging the wrong destination.
 */
export function verifySignalContact(contact: SignalContact): SignalIdentityVerdict {
  return verifySignalIdentity({
    identityId: contact.identityId,
    identityKey: contact.identityKey,
    rnsPublicKey: contact.rnsPublicKey,
    lxmfDestinationHash: contact.lxmfDestinationHash,
    transportBindingSignature: contact.transportBindingSignature,
  });
}
