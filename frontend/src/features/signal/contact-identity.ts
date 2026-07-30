/**
 * Offline-verifiable Signal contact identity.
 *
 * A saved contact is only worth having during a blackout if the device can answer "is this
 * really them?" without asking anyone. The index server is a convenience for DISCOVERY; it
 * is never the authority on identity — the client verifies, it never trusts the server's
 * word. Everything below is a pure function over bytes the contact themselves signed, so it
 * produces the same verdict with the network fully disabled.
 *
 * Two independent checks:
 *
 *   1. `identity_id` is DERIVED from the identity key, so an index that swaps the key
 *      cannot keep the ID a user recognises.
 *   2. The LXMF destination is bound to that key by a signature the identity itself made
 *      over `jb:signal:lxmf-binding:v1`. Without this, a compromised index could hand out
 *      a real name and codename pointing at a destination it controls, and every message
 *      "to Amina" would arrive at the adversary instead. The binding is what makes the
 *      address, not just the name, the contact's own claim.
 *
 * These bytes are the same ones the node checks in
 * `backend/src/features/signal/directory/profile.handlers.ts`. The prefix and field order
 * are part of the signed form — changing either here silently invalidates every contact.
 */

import { identityId } from '@jagoo/sdk/core';
import { ed25519 } from '@jagoo/sdk/crypto';

const IDENTITY_KEY_BYTES = 32;
const RNS_PUBLIC_KEY_BYTES = 64;
const LXMF_DESTINATION_BYTES = 16;
const SIGNATURE_BYTES = 64;

const BINDING_PREFIX = new TextEncoder().encode('jb:signal:lxmf-binding:v1\0');

/** The exact bytes a Signal identity signs to claim an LXMF destination. */
export function signalTransportBindingBytes(
  rnsPublicKey: Uint8Array,
  lxmfDestinationHash: Uint8Array,
): Uint8Array {
  const bytes = new Uint8Array(
    BINDING_PREFIX.length + rnsPublicKey.length + lxmfDestinationHash.length,
  );
  bytes.set(BINDING_PREFIX);
  bytes.set(rnsPublicKey, BINDING_PREFIX.length);
  bytes.set(lxmfDestinationHash, BINDING_PREFIX.length + rnsPublicKey.length);
  return bytes;
}

/**
 * The subset of a directory profile or saved contact that carries identity.
 *
 * Display name and bio are deliberately absent: they are labels, and no amount of checking
 * makes a label true. What is verified is the key, the ID derived from it, and the address
 * bound to it.
 */
export interface SignalIdentityMaterial {
  readonly identityId: string;
  /** Ed25519 identity key, hex. */
  readonly identityKey: string;
  /** Reticulum transport key, base64, x25519 ‖ ed25519. */
  readonly rnsPublicKey: string;
  /** LXMF destination, hex. */
  readonly lxmfDestinationHash: string;
  /** Ed25519 over `signalTransportBindingBytes`, base64. */
  readonly transportBindingSignature: string;
}

export type SignalIdentityVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

function hexBytes(value: string, length: number): Uint8Array | null {
  if (!new RegExp(`^[0-9a-fA-F]{${length * 2}}$`).test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function base64Bytes(value: string, length: number): Uint8Array | null {
  try {
    const bytes = Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
    return bytes.length === length ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Verify a contact's identity from the record alone. No network, no clock, no I/O.
 *
 * Called both when saving and again immediately before every send: re-checking costs a
 * single signature verification, and a tampered local store is a far cheaper target for an
 * adversary than the index server is.
 */
export function verifySignalIdentity(material: SignalIdentityMaterial): SignalIdentityVerdict {
  const identityKey = hexBytes(material.identityKey, IDENTITY_KEY_BYTES);
  if (!identityKey) return { ok: false, reason: 'This profile carries no usable identity key.' };

  if (identityId(identityKey) !== material.identityId) {
    return { ok: false, reason: 'The identity ID does not match the identity key it claims.' };
  }

  /**
   * The mesh binding is optional, and its absence is not a failure.
   *
   * This must mirror `SignalDirectoryProfileHandler.validate` exactly: either all three
   * fields are present and the signature verifies, or all three are absent. Treating an
   * absent binding as a verification failure would mark every profile published without a
   * running Reticulum stack — which is nearly all of them, since RNS is Android-dev-build
   * only — as unverified. That is worse than useless: a warning that fires on the normal
   * case is a warning people learn to click past, including on the day it is real.
   *
   * What is checked without a binding is still the thing that matters: that the identity ID
   * is genuinely derived from the key. The binding, when present, additionally proves the
   * key signed its own mesh delivery address.
   */
  const bound = [
    material.rnsPublicKey,
    material.lxmfDestinationHash,
    material.transportBindingSignature,
  ];
  if (bound.every((field) => !field)) return { ok: true };

  const rnsPublicKey = base64Bytes(material.rnsPublicKey, RNS_PUBLIC_KEY_BYTES);
  if (!rnsPublicKey) return { ok: false, reason: 'The mesh transport key is malformed.' };

  const destination = hexBytes(material.lxmfDestinationHash, LXMF_DESTINATION_BYTES);
  if (!destination) return { ok: false, reason: 'The LXMF destination is malformed.' };

  const signature = base64Bytes(material.transportBindingSignature, SIGNATURE_BYTES);
  if (!signature) return { ok: false, reason: 'The address binding signature is missing.' };

  if (
    !ed25519.verify(signature, signalTransportBindingBytes(rnsPublicKey, destination), identityKey)
  ) {
    return {
      ok: false,
      reason: 'This identity did not sign the delivery address the index gave for it.',
    };
  }

  return { ok: true };
}
