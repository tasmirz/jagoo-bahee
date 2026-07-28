/**
 * T1.29 — `jb:message:forum:v1`, pseudonymous DMs (MSG-09, MSG-22, MSG-26).
 *
 * ── The server stores CIPHERTEXT ONLY ───────────────────────────────────────────────
 * v1 stored message markdown in plaintext, signed but unencrypted. Server compromise or
 * physical seizure exposed every private conversation ever sent — the single
 * highest-severity data risk in the v1 system given this threat model. This projection has
 * no plaintext field at all, so there is nothing to leak and nothing to subpoena.
 * `P4-G7`/`AC-47` verify it by inspecting the database directly.
 *
 * ── MSG-26: metadata beyond delivery need is not logged ─────────────────────────────
 * Recipient and thread are stored because delivery requires them. Timing, read state and
 * routing history are not. What the node does not record, it cannot be compelled to hand
 * over.
 *
 * The envelope is DIRECT priority and budgeted at <= 1 KB (MSG-33) so it traverses mesh and
 * radio unchanged. Attachments are referenced by content ID, never inlined.
 */

import { ForumMessageSend } from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  denied,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { hexKey } from '../shared/permissions.js';
import { BLOCKS_COLLECTION, type EdgeDoc } from '../social/social.handlers.js';

export const FORUM_MESSAGES_COLLECTION = 'forum_messages';

export interface ForumMessageDoc {
  /** content ID of the message envelope. */
  readonly id: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  /** Opaque. There is deliberately no plaintext column. */
  readonly ciphertext: string;
  readonly kemCiphertext: string;
  readonly ephemeralX25519: string;
  readonly thread: string;
  readonly ratchetIndex: number;
  readonly createdAtMs: number;
}

export class ForumMessageHandler implements DomainHandler<ForumMessageSend> {
  readonly domain = 'jb:message:forum:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ForumMessageSend {
    return ForumMessageSend.decode(body);
  }

  validate(body: ForumMessageSend, env: ParsedEnvelope): ValidationResult {
    if (body.recipient_key.length !== 32) {
      return invalid('recipient_key must be a 32-byte key', 'recipient_key');
    }
    if (body.ciphertext.length === 0) return invalid('ciphertext is required', 'ciphertext');
    if (Buffer.from(body.recipient_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a key cannot message itself', 'recipient_key');
    }
    return valid;
  }

  async authorize(body: ForumMessageSend, env: ParsedEnvelope): Promise<AuthDecision> {
    // MSG-06: a block is enforced at the point of delivery. The recipient's block row is
    // keyed (recipient, sender) — the sender never learns it exists beyond this rejection.
    const recipient = Buffer.from(body.recipient_key).toString('hex');
    const blocked = await this.projections
      .collection<EdgeDoc>(BLOCKS_COLLECTION)
      .findOne({ id: `${recipient}:${hexKey(env.authorKey)}` });
    if (blocked) return denied('the recipient does not accept messages from this key');
    return allowed;
  }

  async project(body: ForumMessageSend, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: ForumMessageDoc = {
      id: env.contentId,
      senderKey: hexKey(env.authorKey),
      recipientKey: Buffer.from(body.recipient_key).toString('hex'),
      ciphertext: Buffer.from(body.ciphertext).toString('base64'),
      kemCiphertext: Buffer.from(body.kem_ciphertext).toString('base64'),
      ephemeralX25519: Buffer.from(body.ephemeral_x25519).toString('base64'),
      thread: body.thread,
      ratchetIndex: body.ratchet_index,
      createdAtMs: Number(env.createdAtMs),
    };
    await this.projections
      .collection<ForumMessageDoc>(FORUM_MESSAGES_COLLECTION)
      .put(doc.id, doc, tx);
  }
}
