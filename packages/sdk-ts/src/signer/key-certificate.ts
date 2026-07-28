/**
 * Key certificate signing preimages (Plans/01 §6, ADR-004).
 *
 * ── Why this lives in the SDK rather than in the node ───────────────────────────────
 * A certificate is signed on a device and verified on every node that ever sees content
 * from that key. If the two sides computed the preimage separately they would drift, and
 * the failure would look like "this person's key is not certified" rather than like a bug.
 * One implementation, imported by both (VIS-04).
 *
 * ── Domain separation ───────────────────────────────────────────────────────────────
 * Both preimages start with a distinct constant, so a certificate self-signature can never
 * be replayed as an envelope signature or as a PQ attestation, and vice versa (NFR-S02,
 * AB-05). The `plane` is inside the self-signature for the same reason it is inside an
 * envelope: a FORUM certificate must not be liftable into a SIGNAL one (SEP-02).
 */

import { ByteWriter } from '../core/wire.js';
import type { Plane } from '../core/types.js';

const SELF_SIGNATURE_CONTEXT = 'jb:key:certificate:self:v1';
const PQ_ATTESTATION_CONTEXT = 'jb:key:certificate:pq:v1';
const REVOCATION_AUTHORIZATION_CONTEXT = 'jb:key:revocation:authorize:v1';

export interface KeyCertificateFields {
  readonly plane: Plane;
  /** Ed25519, 32 B — the key this certificate is about. */
  readonly deviceKey: Uint8Array;
  /** ML-DSA-44 public key, 1312 B. */
  readonly pqKey: Uint8Array;
  readonly validFrom: bigint;
  readonly validUntil: bigint;
}

export interface KeyRevocationFields {
  readonly plane: Plane;
  readonly revokedKey: Uint8Array;
  readonly kind: number;
  readonly effectiveFromMs: bigint;
  readonly replacementKey: Uint8Array;
}

function writeContext(w: ByteWriter, context: string): void {
  const bytes = new TextEncoder().encode(context);
  w.varint(BigInt(bytes.length));
  w.bytes(bytes);
}

function writeBytes(w: ByteWriter, value: Uint8Array): void {
  w.varint(BigInt(value.length));
  w.bytes(value);
}

/**
 * What the ML-DSA key attests to: `device_key ‖ valid_from ‖ valid_until`.
 *
 * This is the post-quantum half. It is computed ONCE per identity and cached, never per
 * message — a 2420-byte signature is roughly twelve LoRa frames, so per-message PQ signing
 * would make the radio path unusable (KY-05). Amortising it here is what lets peers verify
 * a 64-byte Ed25519 signature against a key that is itself PQ-attested.
 */
export function pqAttestationBytes(fields: KeyCertificateFields): Uint8Array {
  const w = new ByteWriter(128);
  writeContext(w, PQ_ATTESTATION_CONTEXT);
  writeBytes(w, fields.deviceKey);
  w.varint(fields.validFrom);
  w.varint(fields.validUntil);
  return w.finish();
}

/**
 * What the device key signs to prove it consented to this certificate.
 *
 * Covers the PQ attestation too, so an attacker cannot pair a genuine self-signature with
 * a PQ attestation of their own choosing.
 */
export function certificateSelfSignatureBytes(
  fields: KeyCertificateFields,
  pqAttestation: Uint8Array,
): Uint8Array {
  const w = new ByteWriter(256);
  writeContext(w, SELF_SIGNATURE_CONTEXT);
  w.varint(BigInt(fields.plane));
  writeBytes(w, fields.deviceKey);
  writeBytes(w, fields.pqKey);
  writeBytes(w, pqAttestation);
  w.varint(fields.validFrom);
  w.varint(fields.validUntil);
  return w.finish();
}

/**
 * Preimage signed by the key being revoked for a courier-publishable DURESS revocation.
 * The outer envelope authenticates the courier; this inner signature proves that the
 * identity owner authorized this exact revocation while they still controlled the key.
 */
export function revocationAuthorizationBytes(fields: KeyRevocationFields): Uint8Array {
  const w = new ByteWriter(160);
  writeContext(w, REVOCATION_AUTHORIZATION_CONTEXT);
  w.varint(BigInt(fields.plane));
  writeBytes(w, fields.revokedKey);
  w.varint(BigInt(fields.kind));
  w.varint(fields.effectiveFromMs);
  writeBytes(w, fields.replacementKey);
  return w.finish();
}
