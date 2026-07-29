/**
 * Per-call peer authentication over gRPC metadata.
 *
 * ── Why this is not in the proto ────────────────────────────────────────────────────
 * `Plans/05` §2 is frozen and `Deliver`/`StreamActivities`/`Backfill` are streams of bare
 * `Envelope`s with no peer field. Adding one would be a contract change requiring a version
 * bump. But the node genuinely must know who is calling: FD-05 attributes the direction
 * ledger to a peer, FD-14 excludes that peer from fanout, FG-09 applies that peer's quota,
 * and FD-16 demotes it. Transport-level authentication belongs in transport metadata, so
 * that is where it goes — three headers carrying a signed, method-bound, time-bound claim.
 *
 * A bare `jb-peer-id` header would be worthless: any caller could name any peer and inherit
 * its quota and its trust. The signature is what makes the header mean something.
 *
 * ── The window is short and one-sided on purpose ────────────────────────────────────
 * 60 seconds. Long enough for real clock drift between two nodes that have already agreed
 * on a ±5 minute envelope window; short enough that a captured token is useless before an
 * operator could notice it was captured.
 */

import { Metadata } from 'nice-grpc';
import { federationCallAuthBytes } from '@jagoo/sdk';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import { ed25519 } from '@jagoo/sdk/crypto';

export const PEER_KEY_HEADER = 'jb-peer-key';
export const PEER_TS_HEADER = 'jb-peer-ts';
export const PEER_NONCE_HEADER = 'jb-peer-nonce';
export const PEER_AUTH_HEADER = 'jb-peer-auth';

export const CALL_AUTH_WINDOW_MS = 60_000;

export interface PeerCallIdentity {
  readonly serverId: string;
  readonly publicKey: Uint8Array;
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const unb64 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64'));

/**
 * Sign a call. Lives here rather than in the outbound adapter because the two halves must
 * agree byte-for-byte, and splitting them across directories is how they drift.
 */
export function signCallMetadata(
  method: string,
  publicKey: Uint8Array,
  sign: (message: Uint8Array) => Uint8Array,
  nowMs: number,
  nonce: Uint8Array,
): Metadata {
  const metadata = new Metadata();
  metadata.set(PEER_KEY_HEADER, b64(publicKey));
  metadata.set(PEER_TS_HEADER, String(nowMs));
  metadata.set(PEER_NONCE_HEADER, b64(nonce));
  metadata.set(PEER_AUTH_HEADER, b64(sign(federationCallAuthBytes(method, BigInt(nowMs), nonce))));
  return metadata;
}

/**
 * Verify a call, or return null.
 *
 * Null rather than throwing: an unauthenticated call is an ordinary outcome on a public
 * federation port, and turning every scan into an exception would make the node's own logs
 * the denial-of-service.
 */
export function verifyCallMetadata(
  method: string,
  metadata: Metadata,
  nowMs: number,
): PeerCallIdentity | null {
  const keyText = metadata.get(PEER_KEY_HEADER);
  const tsText = metadata.get(PEER_TS_HEADER);
  const nonceText = metadata.get(PEER_NONCE_HEADER);
  const authText = metadata.get(PEER_AUTH_HEADER);
  if (!keyText || !tsText || !nonceText || !authText) return null;

  const timestampMs = Number(tsText);
  if (!Number.isFinite(timestampMs)) return null;
  if (Math.abs(nowMs - timestampMs) > CALL_AUTH_WINDOW_MS) return null;

  let publicKey: Uint8Array;
  let signature: Uint8Array;
  let nonce: Uint8Array;
  try {
    publicKey = unb64(keyText);
    signature = unb64(authText);
    nonce = unb64(nonceText);
  } catch {
    return null;
  }
  if (publicKey.length !== 32 || signature.length !== 64 || nonce.length < 8) return null;

  const message = federationCallAuthBytes(method, BigInt(timestampMs), nonce);
  if (!ed25519.verify(signature, message, publicKey)) return null;

  return { serverId: serverIdOf(publicKey), publicKey };
}
