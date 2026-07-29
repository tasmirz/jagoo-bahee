/**
 * `Announce` admission — the pure half (T2.2, FG-01).
 *
 * Everything that decides whether a handshake is acceptable lives here as a function of
 * its arguments. The gRPC adapter does no checking of its own; it decodes a frame, calls
 * `checkAnnounce`, and translates the verdict. That split is what makes FG-01 provable
 * without a socket.
 *
 * ── The signature is checked before anything is written ─────────────────────────────
 * TOFU means "trust on first use", not "accept whatever arrives". The peer's key is the
 * peer's identity (FD-02), so a handshake that does not prove possession of that key is
 * not a first contact — it is someone claiming to be a node they are not, and admitting it
 * would let anyone occupy an existing peer's identity by announcing over it.
 */

import { announceRequestSigningBytes, type AnnounceRequestFields } from '@jagoo/sdk';
import { ED25519_PUBLIC_KEY_BYTES, ED25519_SIGNATURE_BYTES } from '@jagoo/sdk/core';

/** ±5 minutes, matching the envelope clock window. A node with a broken clock is a real case. */
export const ANNOUNCE_WINDOW_MS = 5 * 60 * 1000;

/** A nonce shorter than this is not a replay guard, it is a decoration. */
export const MIN_ANNOUNCE_NONCE_BYTES = 8;

export type AnnounceVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const reject = (reason: string): AnnounceVerdict => ({ ok: false, reason });

export interface AnnounceCheckInput {
  readonly fields: AnnounceRequestFields;
  readonly signature: Uint8Array;
  readonly nowMs: number;
  readonly windowMs?: number;
  /** Injected so the domain stays free of a crypto library (AR-01). */
  readonly verify: (key: Uint8Array, message: Uint8Array, signature: Uint8Array) => boolean;
}

export function checkAnnounce(input: AnnounceCheckInput): AnnounceVerdict {
  const { fields } = input;

  if (fields.serverKey.length !== ED25519_PUBLIC_KEY_BYTES) {
    return reject('server_key is not an Ed25519 public key');
  }
  if (input.signature.length !== ED25519_SIGNATURE_BYTES) {
    return reject('signature is not an Ed25519 signature');
  }
  if (fields.nonce.length < MIN_ANNOUNCE_NONCE_BYTES) {
    return reject('nonce is too short to prevent replay');
  }

  const window = input.windowMs ?? ANNOUNCE_WINDOW_MS;
  const skew = Number(fields.timestampMs) - input.nowMs;
  if (skew > window) return reject('announce timestamp is in the future');
  if (-skew > window) return reject('announce timestamp is too old');

  if (fields.planes.length === 0) {
    // FD-07: a peer that serves no plane has nothing to federate, and silently admitting
    // it would create a peer the outbox forever queues for and never drains.
    return reject('peer advertises no planes');
  }

  for (const endpoint of fields.endpoints) {
    if (!isRoutableEndpointUri(endpoint.uri)) {
      return reject(`endpoint uri is not routable: ${endpoint.uri}`);
    }
  }

  const message = announceRequestSigningBytes(fields);
  if (!input.verify(fields.serverKey, message, input.signature)) {
    return reject('announce signature verification failed');
  }

  return { ok: true };
}

/**
 * Schemes this build knows how to dial, plus the ones a later phase will.
 *
 * An unknown scheme is rejected rather than stored, because a stored endpoint that no
 * transport can reach is indistinguishable from a peer that is merely down — and FD-06's
 * backoff would retry it forever. `rns://` and `mesh://` are accepted now so that a P6
 * node announcing to a P2 node is not turned away by a peer that simply predates it.
 */
const ROUTABLE_SCHEMES = ['grpc://', 'grpcs://', 'https://', 'http://', 'rns://', 'mesh://'];

export function isRoutableEndpointUri(uri: string): boolean {
  if (uri.length === 0 || uri.length > 512) return false;
  return ROUTABLE_SCHEMES.some((scheme) => uri.startsWith(scheme));
}
