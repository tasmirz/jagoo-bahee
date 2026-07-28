/**
 * Pipeline steps 11 and 12 — DEDUPE and REPLAY.
 *
 * Both are READS. Neither writes, so an invalid-envelope flood cannot amplify into writes
 * (VP-01). The authoritative enforcement lives in the storage layer as a unique index —
 * these steps are the cheap early-out, not the guarantee. A read-then-write check alone is
 * racy under concurrency; the index is what actually makes it correct.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5
 */

import type { EnvelopeReader } from '../../ports/storage.port.js';
import type { ParsedEnvelope } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';

/**
 * Step 11 — DEDUPE.
 *
 * ── ER-01: DUPLICATE is not a failure ───────────────────────────────────────────────
 * The same content ID arriving twice is the NORMAL case in this system: an envelope may
 * reach a node over HTTP, again via federation, and again over mesh. Rejecting the retry
 * with an error the client treats as fatal would make store-and-forward unusable. So the
 * caller answers a duplicate with the ORIGINAL receipt, which makes retry safe and the
 * whole write path idempotent.
 *
 * This throws so the pipeline short-circuits; `ingress` catches `DUPLICATE` specifically
 * and replays the stored receipt.
 */
export async function acceptDedupe(env: ParsedEnvelope, reader: EnvelopeReader): Promise<void> {
  if (await reader.has(env.contentId)) {
    throw new EnvelopeRejected(RejectionCode.DUPLICATE, 'content already accepted');
  }
}

/**
 * Step 12 — REPLAY, for non-idempotent domains only.
 *
 * Idempotent domains are content-addressed: re-sending the same post yields the same
 * content ID and is caught by DEDUPE. Non-idempotent domains are the dangerous ones — a
 * moderator ban, a vote change — where the same author could legitimately produce two
 * different-but-similar envelopes, so the nonce is what distinguishes a fresh action from
 * a captured one being replayed (P1-G8).
 */
export interface NonceSeenCheck {
  (authorKey: Uint8Array, nonce: Uint8Array): Promise<boolean>;
}

export async function acceptReplay(
  env: ParsedEnvelope,
  idempotent: boolean,
  seen: NonceSeenCheck,
): Promise<void> {
  if (idempotent) return;

  if (env.nonce.length === 0) {
    // AB-05: a non-idempotent domain without a nonce has no replay protection at all.
    throw new EnvelopeRejected(RejectionCode.REPLAY, 'nonce is required for this domain', {
      field: 'nonce',
    });
  }

  if (await seen(env.authorKey, env.nonce)) {
    throw new EnvelopeRejected(RejectionCode.REPLAY, 'nonce has already been used');
  }
}
