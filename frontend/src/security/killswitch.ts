/**
 * A second passphrase that destroys instead of unlocking.
 *
 * ── The threat this answers ────────────────────────────────────────────────────────
 * "Panic wipe" is a button, and a button is useless in the situation it exists for: the
 * moment someone is standing over you demanding the password, you cannot reach for a control
 * labelled "destroy everything". What you can do is comply — and have compliance be the
 * destruction. The killswitch passphrase is entered into the ordinary unlock field, wipes
 * both vaults, and leaves the app in the state of a device that was never set up.
 *
 * That last part is the design decision worth stating. The alternative — reporting "wrong
 * password" after wiping — keeps the coercion going against a device that no longer holds
 * anything, and invites a second, angrier attempt. Landing on the setup screen ends the
 * interaction: there is nothing here, and now that is true.
 *
 * ── What it deliberately does NOT do ───────────────────────────────────────────────
 * It does not publish a revocation. `revokeSignalKey`/`revokeForumKey` and
 * `prepareDuressRevocation` exist for the case where you want the network told; that needs
 * a reachable node, it is observable by whoever is watching the screen, and it cannot be
 * undone. A killswitch has to work with the radio off and without announcing itself. The two
 * are complementary, and conflating them would make the silent one impossible.
 *
 * ── Storage ────────────────────────────────────────────────────────────────────────
 * Only a salted scrypt verifier is kept, never the passphrase — the same primitive and cost
 * the vaults themselves use, so a stored verifier is no cheaper to attack than a vault. It
 * lives in SecureStore beside them and is removed by its own wipe.
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { cryptoBackend } from '@jagoo/sdk/crypto';
import { panicForum } from './panic';
import { panicSignal } from '../signer/signal';

const KILLSWITCH_KEY = 'jb.killswitch.v1';
const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const text = new TextEncoder();
const base64 = (value: Uint8Array): string => globalThis.btoa(String.fromCharCode(...value));
const unbase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));

interface KillswitchRecord {
  readonly version: 1;
  readonly salt: string;
  readonly verifier: string;
}

/** Same cost as a vault: a stored verifier must not be the cheap way in. */
function derive(passphrase: string, salt: Uint8Array): Uint8Array {
  return cryptoBackend().scrypt(text.encode(passphrase), salt, {
    N: 1 << 16,
    r: 8,
    p: 1,
    dkLen: 32,
  });
}

/** Constant-time compare. A verifier check must not leak its answer through timing. */
function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number);
  }
  return difference === 0;
}

export async function isKillswitchConfigured(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KILLSWITCH_KEY, storeOptions)) !== null;
}

/**
 * Arm the killswitch. Refuses a passphrase too short to be typed under pressure without
 * being guessed by accident, and — the important one — refuses one that unlocks a vault.
 * The caller checks that; this cannot, because it never sees a vault passphrase.
 */
export async function setKillswitchPassphrase(passphrase: string): Promise<void> {
  if (passphrase.length < 4) {
    throw new Error('A killswitch passphrase must be at least 4 characters.');
  }
  const salt = await Crypto.getRandomBytesAsync(16);
  const verifier = derive(passphrase, salt);
  try {
    await SecureStore.setItemAsync(
      KILLSWITCH_KEY,
      JSON.stringify({
        version: 1,
        salt: base64(salt),
        verifier: base64(verifier),
      } satisfies KillswitchRecord),
      storeOptions,
    );
  } finally {
    verifier.fill(0);
  }
}

export async function clearKillswitchPassphrase(): Promise<void> {
  await SecureStore.deleteItemAsync(KILLSWITCH_KEY, storeOptions);
}

/**
 * Does this input arm the killswitch? False whenever none is set, so an unlock path can call
 * it unconditionally.
 */
export async function isKillswitchPassphrase(candidate: string): Promise<boolean> {
  const encoded = await SecureStore.getItemAsync(KILLSWITCH_KEY, storeOptions);
  if (!encoded) return false;
  try {
    const record = JSON.parse(encoded) as KillswitchRecord;
    if (record.version !== 1) return false;
    const derived = derive(candidate, unbase64(record.salt));
    try {
      return sameBytes(derived, unbase64(record.verifier));
    } finally {
      derived.fill(0);
    }
  } catch {
    return false;
  }
}

/**
 * Destroy both planes and the killswitch itself.
 *
 * Both, always. A killswitch that spared the Forum vault would leave behind exactly the
 * pseudonymous history whose exposure this system treats as the serious harm, and one that
 * spared the Signal vault would leave a named identity and its contacts. Every step is
 * attempted even if an earlier one throws — a half-wipe is the worst outcome available, and
 * "the vault would not open" is not a reason to keep the rest.
 */
export async function triggerKillswitch(): Promise<void> {
  const failures: unknown[] = [];
  for (const step of [panicForum, panicSignal, clearKillswitchPassphrase]) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new Error('The wipe did not complete on this device.');
  }
}
