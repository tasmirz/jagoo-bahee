import AsyncStorage from '@react-native-async-storage/async-storage';

const CONTACTS_KEY = 'jb.signal.contacts.v2';

export interface SignalContact {
  readonly identityId: string;
  readonly displayName: string;
  readonly lxmfDestinationHash: string;
  readonly rnsPublicKey: string;
  readonly followed: boolean;
  readonly messagedAtMs: number | null;
  readonly savedAtMs: number;
}

async function load(): Promise<readonly SignalContact[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CONTACTS_KEY)) ?? '[]') as readonly SignalContact[];
  } catch {
    return [];
  }
}

export async function loadSignalContacts(): Promise<readonly SignalContact[]> {
  return load();
}

/** Contacts and follows remain on this device; no subscription graph is sent to the index. */
export async function saveSignalContact(contact: SignalContact): Promise<void> {
  const contacts = await load();
  await AsyncStorage.setItem(
    CONTACTS_KEY,
    JSON.stringify([...contacts.filter((row) => row.identityId !== contact.identityId), contact]),
  );
}

export async function setSignalContactFollowed(identityId: string, followed: boolean): Promise<void> {
  const contacts = await load();
  await AsyncStorage.setItem(
    CONTACTS_KEY,
    JSON.stringify(contacts.map((contact) => (contact.identityId === identityId ? { ...contact, followed } : contact))),
  );
}
