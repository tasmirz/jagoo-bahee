/**
 * ML-DSA-44 — identity certificates ONLY.
 *
 * AUTH-13 / KY-05: never used for per-message signing. A 2420-byte signature does not
 * fit a constrained link, and the threat it would defend against is not real: a
 * signature forged in 2035 over a 2026 broadcast has no value to anyone. What IS real is
 * future identity impersonation, so the Ed25519 device key is post-quantum attested once
 * in a certificate and cached. Peers then verify a 64-byte Ed25519 signature against an
 * Ed25519 key that is itself PQ-attested — the cost is amortised across every message
 * that key ever signs.
 *
 * Specification: Plans/01-IDENTITY-PLANES.md §6–7
 */

import { cryptoBackend } from './backend.js';

export const ML_DSA_44_PUBLIC_KEY_BYTES = 1312;
export const ML_DSA_44_SIGNATURE_BYTES = 2420;

export interface MlDsaKeyPair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

export function generateKeyPair(seed: Uint8Array): MlDsaKeyPair {
  return cryptoBackend().mlDsa44KeyPair(seed);
}

/** Attest a device key: sign `device_key ‖ valid_from ‖ valid_until` (KeyCertificate §6). */
export function attest(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return cryptoBackend().mlDsa44Sign(message, secretKey);
}

export function verifyAttestation(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== ML_DSA_44_SIGNATURE_BYTES) return false;
  if (publicKey.length !== ML_DSA_44_PUBLIC_KEY_BYTES) return false;
  try {
    return cryptoBackend().mlDsa44Verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
