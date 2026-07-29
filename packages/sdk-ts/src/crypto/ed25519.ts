/**
 * Ed25519 — every per-message signature in the system.
 *
 * AUTH-25 / KY-05: 64-byte signatures, 32-byte keys. This is the constraint that makes
 * the radio and mesh paths viable at all. One ML-DSA-44 signature is 2420 bytes, which
 * is roughly twelve LoRa frames before any content, each with independent loss
 * probability — signing per-message with a post-quantum algorithm makes the radio path
 * unusable.
 *
 * The post-quantum budget is spent by actual threat instead:
 *   · harvest-now-decrypt-later on messages IS real  -> hybrid X25519 + ML-KEM-768 (kem.ts)
 *   · retroactive signature forgery is NOT           -> Ed25519 stays, 64 B
 *   · future identity impersonation is, eventually   -> ML-DSA-44 certificate, signed once
 *
 * Specification: Plans/01-IDENTITY-PLANES.md §7
 */

import { ED25519_PUBLIC_KEY_BYTES, ED25519_SIGNATURE_BYTES } from '../core/types.js';
import { cryptoBackend } from './backend.js';

export function derivePublicKey(privateKey: Uint8Array): Uint8Array {
  return cryptoBackend().ed25519PublicKey(privateKey);
}

export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return cryptoBackend().ed25519Sign(message, privateKey);
}

/**
 * Verify a signature. Returns false rather than throwing on malformed input — a
 * malformed signature from a hostile peer is an ordinary rejection at pipeline step 9,
 * not an exceptional condition, and an exception here would be a trivial DoS.
 */
export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== ED25519_SIGNATURE_BYTES) return false;
  if (publicKey.length !== ED25519_PUBLIC_KEY_BYTES) return false;
  try {
    return cryptoBackend().ed25519Verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
