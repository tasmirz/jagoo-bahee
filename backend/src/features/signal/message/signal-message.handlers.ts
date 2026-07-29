import {
  DeliveryState,
  PrekeyBundle,
  SignalDeliveryReceipt,
  SignalGroupCreate,
  SignalGroupUpdate,
  SignalMessage,
  SignalSessionInit,
} from '@jagoo/sdk/proto';
import { crypto as sdkCrypto } from '@jagoo/sdk';
import { signalPrekeySignatureBytes } from '@jagoo/sdk/crypto';
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

export const SIGNAL_PREKEYS_COLLECTION = 'signal_prekeys';
export const SIGNAL_SESSIONS_COLLECTION = 'signal_sessions';
export const SIGNAL_MESSAGES_COLLECTION = 'signal_messages';
export const SIGNAL_GROUPS_COLLECTION = 'signal_groups';

export interface SignalPrekeyDoc {
  readonly id: string;
  readonly identityKey: string;
  readonly signedPrekey: string;
  readonly signedPrekeySignature: string;
  readonly kemPublicKey: string;
  readonly oneTimePrekeys: readonly string[];
  readonly validUntilMs: number;
  readonly contentId: string;
}

export interface SignalSessionDoc {
  readonly id: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly kemCiphertext: string;
  readonly ephemeralX25519: string;
  readonly usedPrekeyId: string;
  /** Opaque authenticated ciphertext. There is deliberately no plaintext field. */
  readonly ciphertext: string;
  readonly createdAtMs: number;
  readonly lastCounter: string;
}

export interface SignalMessageDoc {
  readonly id: string;
  readonly session: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly counter: string;
  readonly header: string;
  /** Opaque authenticated ciphertext. There is deliberately no plaintext field. */
  readonly ciphertext: string;
  readonly attachmentRefs: readonly string[];
  readonly createdAtMs: number;
  readonly deliveryState: DeliveryState;
  readonly deliveryUpdatedAtMs: number;
}

export interface SignalGroupDoc {
  readonly id: string;
  readonly name: string;
  readonly adminKey: string;
  readonly memberKeys: readonly string[];
  readonly groupKeyWrapped: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');
const base64 = (value: Uint8Array): string => Buffer.from(value).toString('base64');

export class PrekeyBundleHandler implements DomainHandler<PrekeyBundle> {
  readonly domain = 'jb:message:prekeys:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): PrekeyBundle {
    return PrekeyBundle.decode(body);
  }
  validate(body: PrekeyBundle, env: ParsedEnvelope): ValidationResult {
    if (
      body.identity_key.length !== 32 ||
      !Buffer.from(body.identity_key).equals(Buffer.from(env.authorKey))
    ) {
      return invalid('identity_key must equal the 32-byte envelope author key', 'identity_key');
    }
    if (body.signed_prekey.length !== 32 || body.signed_prekey_sig.length !== 64) {
      return invalid('a signed 32-byte X25519 prekey is required', 'signed_prekey');
    }
    if (body.kem_public_key.length === 0) {
      return invalid('ML-KEM-768 public key is required', 'kem_public_key');
    }
    if (body.one_time_prekeys.length > 100) {
      return invalid('at most 100 one-time prekeys may be published', 'one_time_prekeys');
    }
    if (body.one_time_prekeys.some((key) => key.length !== 32)) {
      return invalid('one-time prekeys must be 32 bytes', 'one_time_prekeys');
    }
    if (body.valid_until_ms <= env.createdAtMs) {
      return invalid('prekey bundle must expire in the future', 'valid_until_ms');
    }
    const signed = signalPrekeySignatureBytes({
      identityKey: body.identity_key,
      signedPrekey: body.signed_prekey,
      kemPublicKey: body.kem_public_key,
      validUntilMs: body.valid_until_ms,
    });
    if (!sdkCrypto.ed25519.verify(body.signed_prekey_sig, signed, body.identity_key)) {
      return invalid('signed prekey signature does not verify', 'signed_prekey_sig');
    }
    return valid;
  }
  async authorize(): Promise<AuthDecision> {
    return allowed;
  }
  async project(body: PrekeyBundle, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = hex(env.authorKey);
    await this.projections
      .collection<SignalPrekeyDoc>(SIGNAL_PREKEYS_COLLECTION)
      .put(
        id,
        {
          id,
          identityKey: id,
          signedPrekey: base64(body.signed_prekey),
          signedPrekeySignature: base64(body.signed_prekey_sig),
          kemPublicKey: base64(body.kem_public_key),
          oneTimePrekeys: body.one_time_prekeys.map(base64),
          validUntilMs: Number(body.valid_until_ms),
          contentId: env.contentId,
        },
        tx,
      );
  }
}

export class SignalSessionHandler implements DomainHandler<SignalSessionInit> {
  readonly domain = 'jb:message:session:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): SignalSessionInit {
    return SignalSessionInit.decode(body);
  }
  validate(body: SignalSessionInit, env: ParsedEnvelope): ValidationResult {
    if (body.recipient_key.length !== 32) {
      return invalid('recipient_key must be 32 bytes', 'recipient_key');
    }
    if (Buffer.from(body.recipient_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a key cannot message itself', 'recipient_key');
    }
    if (
      body.kem_ciphertext.length === 0 ||
      body.ephemeral_x25519.length !== 32 ||
      body.ciphertext.length < 28
    ) {
      return invalid('hybrid session ciphertext is incomplete', 'ciphertext');
    }
    return valid;
  }
  async authorize(body: SignalSessionInit, env: ParsedEnvelope): Promise<AuthDecision> {
    const prekey = await this.projections
      .collection<SignalPrekeyDoc>(SIGNAL_PREKEYS_COLLECTION)
      .findOne({ id: hex(body.recipient_key) });
    return prekey && prekey.validUntilMs > Number(env.createdAtMs)
      ? allowed
      : denied('recipient has no valid prekey bundle');
  }
  async project(body: SignalSessionInit, env: ParsedEnvelope, tx: Tx): Promise<void> {
    await this.projections
      .collection<SignalSessionDoc>(SIGNAL_SESSIONS_COLLECTION)
      .put(
        env.contentId,
        {
          id: env.contentId,
          senderKey: hex(env.authorKey),
          recipientKey: hex(body.recipient_key),
          kemCiphertext: base64(body.kem_ciphertext),
          ephemeralX25519: base64(body.ephemeral_x25519),
          usedPrekeyId: base64(body.used_prekey_id),
          ciphertext: base64(body.ciphertext),
          createdAtMs: Number(env.createdAtMs),
          lastCounter: '-1',
        },
        tx,
      );
  }
}

export class SignalMessageHandler implements DomainHandler<SignalMessage> {
  readonly domain = 'jb:message:signal:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): SignalMessage {
    return SignalMessage.decode(body);
  }
  validate(body: SignalMessage): ValidationResult {
    if (!body.session.startsWith('jb1')) return invalid('session must be a content ID', 'session');
    if (body.ciphertext.length < 16) return invalid('ciphertext is required', 'ciphertext');
    if (body.attachment_refs.some((value) => !value.startsWith('jb1'))) {
      return invalid('attachment_refs must be content IDs', 'attachment_refs');
    }
    return valid;
  }
  async authorize(body: SignalMessage, env: ParsedEnvelope): Promise<AuthDecision> {
    const session = await this.projections
      .collection<SignalSessionDoc>(SIGNAL_SESSIONS_COLLECTION)
      .findOne({ id: body.session });
    if (!session) return denied('session is not known here');
    if (session.senderKey !== hex(env.authorKey) && session.recipientKey !== hex(env.authorKey)) {
      return denied('message author is not part of the session');
    }
    if (body.counter <= BigInt(session.lastCounter)) {
      return denied('ratchet counter must increase');
    }
    return allowed;
  }
  async project(body: SignalMessage, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const sessions = this.projections.collection<SignalSessionDoc>(SIGNAL_SESSIONS_COLLECTION);
    const session = await sessions.findOne({ id: body.session });
    if (!session) return;
    const senderKey = hex(env.authorKey);
    const recipientKey =
      senderKey === session.senderKey ? session.recipientKey : session.senderKey;
    await this.projections
      .collection<SignalMessageDoc>(SIGNAL_MESSAGES_COLLECTION)
      .put(
        env.contentId,
        {
          id: env.contentId,
          session: body.session,
          senderKey,
          recipientKey,
          counter: body.counter.toString(),
          header: base64(body.header),
          ciphertext: base64(body.ciphertext),
          attachmentRefs: [...body.attachment_refs],
          createdAtMs: Number(env.createdAtMs),
          deliveryState: DeliveryState.DELIVERY_STATE_QUEUED,
          deliveryUpdatedAtMs: Number(env.createdAtMs),
        },
        tx,
      );
    await sessions.put(session.id, { ...session, lastCounter: body.counter.toString() }, tx);
  }
}

export class SignalDeliveryReceiptHandler implements DomainHandler<SignalDeliveryReceipt> {
  readonly domain = 'jb:message:receipt:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): SignalDeliveryReceipt {
    return SignalDeliveryReceipt.decode(body);
  }
  validate(body: SignalDeliveryReceipt): ValidationResult {
    if (!body.message.startsWith('jb1')) return invalid('message must be a content ID', 'message');
    if (body.state === DeliveryState.DELIVERY_STATE_UNSPECIFIED) {
      return invalid('delivery state is required', 'state');
    }
    return valid;
  }
  async authorize(body: SignalDeliveryReceipt, env: ParsedEnvelope): Promise<AuthDecision> {
    const message = await this.projections
      .collection<SignalMessageDoc>(SIGNAL_MESSAGES_COLLECTION)
      .findOne({ id: body.message });
    return message?.recipientKey === hex(env.authorKey)
      ? allowed
      : denied('only the recipient can acknowledge this message');
  }
  async project(body: SignalDeliveryReceipt, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const messages = this.projections.collection<SignalMessageDoc>(SIGNAL_MESSAGES_COLLECTION);
    const message = await messages.findOne({ id: body.message });
    if (!message || body.state < message.deliveryState) return;
    await messages.put(
      message.id,
      {
        ...message,
        deliveryState: body.state,
        deliveryUpdatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class SignalGroupCreateHandler implements DomainHandler<SignalGroupCreate> {
  readonly domain = 'jb:group:create:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): SignalGroupCreate {
    return SignalGroupCreate.decode(body);
  }
  validate(body: SignalGroupCreate): ValidationResult {
    if (!body.name.trim()) return invalid('group name is required', 'name');
    if (body.member_keys.length < 2 || body.member_keys.length > 64) {
      return invalid('groups require 2 to 64 members', 'member_keys');
    }
    if (body.member_keys.some((key) => key.length !== 32)) {
      return invalid('member keys must be 32 bytes', 'member_keys');
    }
    if (body.group_key_wrapped.length === 0) {
      return invalid('wrapped sender key is required', 'group_key_wrapped');
    }
    return valid;
  }
  async authorize(): Promise<AuthDecision> {
    return allowed;
  }
  async project(body: SignalGroupCreate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    await this.projections
      .collection<SignalGroupDoc>(SIGNAL_GROUPS_COLLECTION)
      .put(
        env.contentId,
        {
          id: env.contentId,
          name: body.name.trim(),
          adminKey: hex(env.authorKey),
          memberKeys: [...new Set(body.member_keys.map(hex))],
          groupKeyWrapped: base64(body.group_key_wrapped),
          createdAtMs: Number(env.createdAtMs),
          updatedAtMs: Number(env.createdAtMs),
        },
        tx,
      );
  }
}

export class SignalGroupUpdateHandler implements DomainHandler<SignalGroupUpdate> {
  readonly domain = 'jb:group:update:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): SignalGroupUpdate {
    return SignalGroupUpdate.decode(body);
  }
  validate(body: SignalGroupUpdate): ValidationResult {
    if (!body.group.startsWith('jb1')) return invalid('group must be a content ID', 'group');
    if (body.rekey_wrapped.length === 0) {
      return invalid('membership changes require a wrapped replacement key', 'rekey_wrapped');
    }
    if ([...body.add, ...body.remove].some((key) => key.length !== 32)) {
      return invalid('member keys must be 32 bytes', 'add');
    }
    return valid;
  }
  async authorize(body: SignalGroupUpdate, env: ParsedEnvelope): Promise<AuthDecision> {
    const group = await this.projections
      .collection<SignalGroupDoc>(SIGNAL_GROUPS_COLLECTION)
      .findOne({ id: body.group });
    return group?.adminKey === hex(env.authorKey) ? allowed : denied('group admin key required');
  }
  async project(body: SignalGroupUpdate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const collection = this.projections.collection<SignalGroupDoc>(SIGNAL_GROUPS_COLLECTION);
    const group = await collection.findOne({ id: body.group });
    if (!group) return;
    const remove = new Set(body.remove.map(hex));
    const members = new Set(group.memberKeys.filter((key) => !remove.has(key)));
    body.add.map(hex).forEach((key) => members.add(key));
    if (members.size > 64) return;
    await collection.put(
      group.id,
      {
        ...group,
        memberKeys: [...members],
        groupKeyWrapped: base64(body.rekey_wrapped),
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}
