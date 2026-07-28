/**
 * Identity and crypto ports.
 *
 * The core declares what it needs verified; it never learns which library does it. That is
 * what lets the Ed25519 path be swapped for a hardware-backed one without the pipeline
 * noticing (AR-11).
 */

import type { KeyAlg } from '../domain/envelope.js';

export abstract class SignatureVerifier {
  /**
   * Returns false rather than throwing on malformed input. A bad signature from a hostile
   * peer is an ordinary rejection at pipeline step 9, not an exceptional condition — and
   * an exception here would be a trivial denial-of-service.
   */
  abstract verify(alg: KeyAlg, key: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean;
}

export interface KeyCertificate {
  readonly key: Uint8Array;
  readonly issuedAtMs: number;
  /** ML-DSA-44 attestation — signed once per identity, never per message (ADR-003 §3). */
  readonly pqAttestation?: Uint8Array;
}

export interface KeyRevocation {
  readonly key: Uint8Array;
  /**
   * KY-01: content signed BEFORE this instant stays valid. Revocation is not retroactive,
   * or every post a person ever made would vanish the moment they rotated a key.
   */
  readonly effectiveFromMs: number;
  readonly reason: string;
}

export abstract class CertificateStore {
  abstract certificateAt(key: Uint8Array, atMs: number): Promise<KeyCertificate | null>;
  abstract revocationFor(key: Uint8Array): Promise<KeyRevocation | null>;
}
