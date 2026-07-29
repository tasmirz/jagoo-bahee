/**
 * Translating between this node's typed rejection contract and the wire.
 *
 * Two directions, both total:
 *   · `RejectionCode` → `ErrorCode` for `DeliverAck.rejected`, so a peer receives the same
 *     20 codes a client receives over HTTP and can act on them identically.
 *   · `EnvelopeRejected` → a gRPC status, for the RPCs that fail as a whole.
 *
 * ── ER-02 applies to peers exactly as it applies to clients ─────────────────────────
 * The `detail` string is the one from the rejection, which is already written not to reveal
 * whether a key exists or what a user's other content is. Anything not in the table is
 * reported as `UNSPECIFIED` rather than as its message — an unexpected internal error must
 * not describe this node's internals to a peer that may have caused it deliberately.
 */

import { Status } from 'nice-grpc';
import { ErrorCode } from '@jagoo/sdk/proto';
import { RejectionCode } from '../../../core/domain/errors.js';

/** Exhaustive by construction: a lookup table, so a new code cannot be silently forgotten. */
const WIRE_CODE: Readonly<Record<RejectionCode, ErrorCode>> = {
  [RejectionCode.UNKNOWN_VERSION]: ErrorCode.ERROR_CODE_UNKNOWN_VERSION,
  [RejectionCode.UNKNOWN_DOMAIN]: ErrorCode.ERROR_CODE_UNKNOWN_DOMAIN,
  [RejectionCode.PLANE_MISMATCH]: ErrorCode.ERROR_CODE_PLANE_MISMATCH,
  [RejectionCode.MALFORMED]: ErrorCode.ERROR_CODE_MALFORMED,
  [RejectionCode.ALG_NOT_PERMITTED]: ErrorCode.ERROR_CODE_ALG_NOT_PERMITTED,
  [RejectionCode.PRIORITY_MISMATCH]: ErrorCode.ERROR_CODE_PRIORITY_MISMATCH,
  [RejectionCode.CLOCK_SKEW]: ErrorCode.ERROR_CODE_CLOCK_SKEW,
  [RejectionCode.BAD_SIGNATURE]: ErrorCode.ERROR_CODE_BAD_SIGNATURE,
  [RejectionCode.NO_CERTIFICATE]: ErrorCode.ERROR_CODE_NO_CERTIFICATE,
  [RejectionCode.KEY_REVOKED]: ErrorCode.ERROR_CODE_KEY_REVOKED,
  [RejectionCode.DUPLICATE]: ErrorCode.ERROR_CODE_DUPLICATE,
  [RejectionCode.REPLAY]: ErrorCode.ERROR_CODE_REPLAY,
  [RejectionCode.INSUFFICIENT_CREDITS]: ErrorCode.ERROR_CODE_INSUFFICIENT_CREDITS,
  [RejectionCode.NULLIFIER_SPENT]: ErrorCode.ERROR_CODE_NULLIFIER_SPENT,
  [RejectionCode.CREDENTIAL_INVALID]: ErrorCode.ERROR_CODE_CREDENTIAL_INVALID,
  [RejectionCode.FORBIDDEN]: ErrorCode.ERROR_CODE_FORBIDDEN,
  [RejectionCode.BODY_INVALID]: ErrorCode.ERROR_CODE_BODY_INVALID,
  [RejectionCode.TOO_LARGE]: ErrorCode.ERROR_CODE_TOO_LARGE,
  [RejectionCode.RATE_LIMITED]: ErrorCode.ERROR_CODE_RATE_LIMITED,
  [RejectionCode.TRANSPORT_UNSUPPORTED]: ErrorCode.ERROR_CODE_TRANSPORT_UNSUPPORTED,
};

export function toWireErrorCode(code: string): ErrorCode {
  return WIRE_CODE[code as RejectionCode] ?? ErrorCode.ERROR_CODE_UNSPECIFIED;
}

export function fromWireErrorCode(code: ErrorCode): string {
  for (const [rejection, wire] of Object.entries(WIRE_CODE)) {
    if (wire === code) return rejection;
  }
  return RejectionCode.MALFORMED;
}

/**
 * Status for an RPC that fails outright.
 *
 * A refused handshake is `UNAUTHENTICATED`, not `INVALID_ARGUMENT`: the peer's request was
 * well-formed, it simply did not prove possession of the key it claimed. A peer that has
 * not handshaked, or is blocked, gets `PERMISSION_DENIED` — and both answers are identical
 * so that "blocked" and "unknown" are indistinguishable from outside, which stops the RPC
 * becoming an oracle for who this node has blocked.
 */
export function grpcStatusFor(code: string): Status {
  switch (code) {
    case RejectionCode.BAD_SIGNATURE:
    case RejectionCode.NO_CERTIFICATE:
    case RejectionCode.KEY_REVOKED:
      return Status.UNAUTHENTICATED;
    case RejectionCode.FORBIDDEN:
      return Status.PERMISSION_DENIED;
    case RejectionCode.RATE_LIMITED:
      return Status.RESOURCE_EXHAUSTED;
    case RejectionCode.TOO_LARGE:
      return Status.INVALID_ARGUMENT;
    case RejectionCode.DUPLICATE:
      return Status.ALREADY_EXISTS;
    default:
      return Status.INVALID_ARGUMENT;
  }
}
