/**
 * What YOU said, kept on this device.
 *
 * ── Why this has to exist ──────────────────────────────────────────────────────────
 * A Signal message is sealed to the recipient's keys, so the sender cannot open it again.
 * `loadSignalMessages` returns `plaintext: null` for anything this device sent, and the
 * screen rendered that as the literal string "Encrypted message sent from this device". Half
 * of every conversation was therefore unreadable to the person who wrote it — which is most
 * of why the thread read as a log rather than as a chat.
 *
 * Keeping the plaintext locally is the only way to show it, and it costs nothing in
 * confidentiality: this device already held it, typed it, and could decrypt nothing new
 * because of it. It is stored under the Signal plane's own key space and is wiped by
 * `clearSignalLocalData`, like every other Signal-plane local record.
 *
 * ── It is also the record of what has NOT gone out ─────────────────────────────────
 * An envelope that could not be delivered sits in the durable outbox as opaque signed bytes —
 * the outbox cannot know it was a message, let alone whose or what it said. Joining these
 * records against the outbox by `contentId` is what lets a queued message appear in the
 * thread it belongs to, marked as still waiting, instead of vanishing until the network
 * returns.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const OUTGOING_KEY = 'jb.signal.outgoing.v1';

/** Trimmed oldest-first. A phone is not an archive, and a thread this long is not readable. */
const MAX_RECORDS = 500;

export interface OutgoingSignalMessage {
  /** The envelope's content ID — the join key against the outbox and the node's copy. */
  readonly contentId: string;
  /** Session this belongs to. For a session opener, its own content ID. */
  readonly session: string;
  readonly recipientKey: string;
  /** 0 for the message that opened the session, matching the node's counters. */
  readonly counter: number;
  readonly plaintext: string;
  readonly sentAtMs: number;
}

async function read(): Promise<readonly OutgoingSignalMessage[]> {
  const encoded = await AsyncStorage.getItem(OUTGOING_KEY);
  if (!encoded) return [];
  try {
    const rows = JSON.parse(encoded) as readonly OutgoingSignalMessage[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function loadOutgoingSignalMessages(): Promise<readonly OutgoingSignalMessage[]> {
  return read();
}

export async function recordOutgoingSignalMessage(
  message: OutgoingSignalMessage,
): Promise<readonly OutgoingSignalMessage[]> {
  const rows = (await read()).filter((row) => row.contentId !== message.contentId);
  const next = [...rows, message].slice(-MAX_RECORDS);
  await AsyncStorage.setItem(OUTGOING_KEY, JSON.stringify(next));
  return next;
}

export async function clearOutgoingSignalMessages(): Promise<void> {
  await AsyncStorage.removeItem(OUTGOING_KEY);
}

const DELETED_KEY = 'jb.signal.deleted-chats.v1';

/**
 * Chats cleared from this device, by counterpart key and when.
 *
 * Deleting is LOCAL, and the semantics have to be honest about that: the node still holds
 * every envelope, and so does the other person's phone. What this removes is this device's
 * copy — the plaintext we kept, and everything already exchanged. Anything that arrives
 * afterwards is new and reappears, because silently swallowing a message someone sent you
 * during a shutdown would be a far worse failure than a chat coming back.
 */
export async function loadDeletedSignalChats(): Promise<Readonly<Record<string, number>>> {
  const encoded = await AsyncStorage.getItem(DELETED_KEY);
  if (!encoded) return {};
  try {
    const rows = JSON.parse(encoded) as Record<string, number>;
    return rows && typeof rows === 'object' ? rows : {};
  } catch {
    return {};
  }
}

/** Clears our stored plaintext for that person and marks everything older as deleted. */
export async function deleteSignalChat(
  counterpartKey: string,
  atMs = Date.now(),
): Promise<Readonly<Record<string, number>>> {
  const key = counterpartKey.toLowerCase();
  const kept = (await read()).filter((row) => row.recipientKey.toLowerCase() !== key);
  await AsyncStorage.setItem(OUTGOING_KEY, JSON.stringify(kept));
  const next = { ...(await loadDeletedSignalChats()), [key]: atMs };
  await AsyncStorage.setItem(DELETED_KEY, JSON.stringify(next));
  return next;
}
