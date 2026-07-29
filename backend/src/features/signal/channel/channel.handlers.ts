import {
  ChannelDeclare,
  ChannelKind,
  ChannelRetire,
  ChannelRotate,
  ChannelUpdate,
  ChannelVouch,
  VouchLevel,
  type BroadcastCategory,
  type ClaimKind,
} from '@jagoo/sdk/proto';
import { channelId } from '@jagoo/sdk';
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

export const SIGNAL_CHANNELS_COLLECTION = 'signal_channels';
export const SIGNAL_CHANNEL_VOUCHES_COLLECTION = 'signal_channel_vouches';

export interface SignalChannelDoc {
  readonly id: string;
  readonly name: string;
  readonly nameSkeleton: string;
  readonly confusableWith: readonly string[];
  readonly description: string;
  readonly kind: ChannelKind;
  readonly categories: readonly BroadcastCategory[];
  readonly defaultArea: GeoAreaDoc | null;
  readonly claims: readonly ClaimDoc[];
  readonly originalSigningKey: string;
  readonly currentSigningKey: string;
  readonly kemPublicKey: string;
  readonly pqKey: string;
  readonly language: string;
  readonly validFromMs: number;
  readonly declaredAtMs: number;
  readonly rotatedAtMs: number | null;
  readonly retiredAtMs: number | null;
  readonly retirementNote: string;
  readonly successorKey: string;
  readonly lastSequence: string;
}

export interface GeoAreaDoc {
  readonly latE5: number;
  readonly lonE5: number;
  readonly radiusM: number;
  readonly placeName: string;
}

export interface ClaimDoc {
  readonly kind: ClaimKind;
  readonly value: string;
  readonly proof: string;
  readonly assertedAtMs: number;
}

export interface SignalChannelVouchDoc {
  readonly id: string;
  readonly channel: string;
  readonly voucherKey: string;
  readonly level: VouchLevel;
  readonly basis: string;
  readonly assertedAtMs: number;
  readonly contentId: string;
}

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');
const sameKey = (left: Uint8Array, rightHex: string): boolean => hex(left) === rightHex;

const CONFUSABLES: Readonly<Record<string, string>> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  Α: 'a',
  Β: 'b',
  Ε: 'e',
  Η: 'h',
  Ι: 'i',
  Κ: 'k',
  Μ: 'm',
  Ν: 'n',
  Ο: 'o',
  Ρ: 'p',
  Τ: 't',
  Χ: 'x',
};

/** CH-02: deterministic display-name skeleton; identity remains the signing key. */
export function channelNameSkeleton(value: string): string {
  return [...value.normalize('NFKC').toLowerCase()]
    .map((character) => CONFUSABLES[character] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]/gu, '');
}

function area(value: ChannelDeclare['default_area']): GeoAreaDoc | null {
  return value
    ? {
        latE5: value.lat_e5,
        lonE5: value.lon_e5,
        radiusM: value.radius_m,
        placeName: value.place_name,
      }
    : null;
}

function claims(value: ChannelDeclare['claims']): readonly ClaimDoc[] {
  return value.map((claim) => ({
    kind: claim.kind,
    value: claim.value,
    proof: claim.proof,
    assertedAtMs: Number(claim.asserted_at_ms),
  }));
}

function validateDeclaration(body: ChannelDeclare, env: ParsedEnvelope): ValidationResult {
  if (env.scope) return invalid('channel declaration must not set a scope', 'scope');
  if (body.signing_key.length !== 32) {
    return invalid('signing_key must be a 32-byte Ed25519 key', 'signing_key');
  }
  if (!Buffer.from(body.signing_key).equals(Buffer.from(env.authorKey))) {
    return invalid('a channel must be declared by its signing key', 'signing_key');
  }
  if (!body.channel_name.trim()) return invalid('channel_name is required', 'channel_name');
  if ([...body.channel_name.trim()].length > 80) {
    return invalid('channel_name exceeds 80 characters', 'channel_name');
  }
  if (body.kind === ChannelKind.CHANNEL_KIND_UNSPECIFIED) {
    return invalid('channel kind is required', 'kind');
  }
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(body.language)) {
    return invalid('language must be a BCP-47 tag', 'language');
  }
  if (body.kem_public_key.length === 0 || body.pq_key.length !== 1312) {
    return invalid('channel KEM and ML-DSA public keys are required', 'kem_public_key');
  }
  return valid;
}

abstract class ChannelOwnerHandler<T> implements DomainHandler<T> {
  abstract readonly domain: string;
  readonly plane = Plane.SIGNAL;

  constructor(protected readonly projections: ProjectionStore) {}

  abstract decode(body: Uint8Array): T;
  abstract validate(body: T, env: ParsedEnvelope): ValidationResult;
  abstract project(body: T, env: ParsedEnvelope, tx: Tx): Promise<void>;

  protected abstract channel(body: T): string;

  async authorize(body: T, env: ParsedEnvelope): Promise<AuthDecision> {
    const id = this.channel(body);
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id });
    if (!channel) return denied('channel is not known here');
    if (channel.retiredAtMs !== null) return denied('channel is retired');
    if (!sameKey(env.authorKey, channel.currentSigningKey)) {
      return denied('the current channel signing key is required');
    }
    return allowed;
  }
}

export class ChannelDeclareHandler implements DomainHandler<ChannelDeclare> {
  readonly domain = 'jb:channel:declare:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ChannelDeclare {
    return ChannelDeclare.decode(body);
  }

  validate(body: ChannelDeclare, env: ParsedEnvelope): ValidationResult {
    return validateDeclaration(body, env);
  }

  async authorize(body: ChannelDeclare): Promise<AuthDecision> {
    const id = channelId(body.signing_key);
    const existing = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id });
    return existing ? denied('channel already exists') : allowed;
  }

  async project(body: ChannelDeclare, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = channelId(body.signing_key);
    const skeleton = channelNameSkeleton(body.channel_name);
    const collection = this.projections.collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION);
    const conflicts = (await collection.find({ nameSkeleton: skeleton }, 20))
      .map((record) => record.id)
      .filter((candidate) => candidate !== id);
    await collection.put(
      id,
      {
        id,
        name: body.channel_name.trim(),
        nameSkeleton: skeleton,
        confusableWith: conflicts,
        description: body.description,
        kind: body.kind,
        categories: [...body.categories],
        defaultArea: area(body.default_area),
        claims: claims(body.claims),
        originalSigningKey: hex(body.signing_key),
        currentSigningKey: hex(body.signing_key),
        kemPublicKey: Buffer.from(body.kem_public_key).toString('base64'),
        pqKey: Buffer.from(body.pq_key).toString('base64'),
        language: body.language,
        validFromMs: Number(body.valid_from),
        declaredAtMs: Number(env.createdAtMs),
        rotatedAtMs: null,
        retiredAtMs: null,
        retirementNote: '',
        successorKey: '',
        lastSequence: '0',
      },
      tx,
    );
  }
}

export class ChannelUpdateHandler extends ChannelOwnerHandler<ChannelUpdate> {
  readonly domain = 'jb:channel:update:v1';

  decode(body: Uint8Array): ChannelUpdate {
    return ChannelUpdate.decode(body);
  }
  protected channel(body: ChannelUpdate): string {
    return body.channel;
  }
  validate(body: ChannelUpdate, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (!body.patch) return invalid('channel patch is required', 'patch');
    if (!body.patch.channel_name.trim()) return invalid('channel_name is required', 'patch.channel_name');
    return valid;
  }
  async project(body: ChannelUpdate, _env: ParsedEnvelope, tx: Tx): Promise<void> {
    const patch = body.patch!;
    const collection = this.projections.collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION);
    const current = await collection.findOne({ id: body.channel });
    if (!current) return;
    const skeleton = channelNameSkeleton(patch.channel_name);
    const conflicts = (await collection.find({ nameSkeleton: skeleton }, 20))
      .map((record) => record.id)
      .filter((id) => id !== current.id);
    await collection.put(
      current.id,
      {
        ...current,
        name: patch.channel_name.trim(),
        nameSkeleton: skeleton,
        confusableWith: conflicts,
        description: patch.description,
        kind: patch.kind,
        categories: [...patch.categories],
        defaultArea: area(patch.default_area),
        claims: claims(patch.claims),
        kemPublicKey:
          patch.kem_public_key.length > 0
            ? Buffer.from(patch.kem_public_key).toString('base64')
            : current.kemPublicKey,
        pqKey:
          patch.pq_key.length > 0
            ? Buffer.from(patch.pq_key).toString('base64')
            : current.pqKey,
        language: patch.language || current.language,
      },
      tx,
    );
  }
}

export class ChannelRotateHandler extends ChannelOwnerHandler<ChannelRotate> {
  readonly domain = 'jb:channel:rotate:v1';
  decode(body: Uint8Array): ChannelRotate {
    return ChannelRotate.decode(body);
  }
  protected channel(body: ChannelRotate): string {
    return body.channel;
  }
  validate(body: ChannelRotate, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (body.new_signing_key.length !== 32 || body.new_kem_key.length === 0) {
      return invalid('new signing and KEM keys are required', 'new_signing_key');
    }
    if (body.effective_from_ms < env.createdAtMs) {
      return invalid('rotation cannot take effect before publication', 'effective_from_ms');
    }
    return valid;
  }
  async project(body: ChannelRotate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const collection = this.projections.collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION);
    const current = await collection.findOne({ id: body.channel });
    if (!current) return;
    await collection.put(
      current.id,
      {
        ...current,
        currentSigningKey: hex(body.new_signing_key),
        kemPublicKey: Buffer.from(body.new_kem_key).toString('base64'),
        rotatedAtMs: Number(body.effective_from_ms || env.createdAtMs),
      },
      tx,
    );
  }
}

export class ChannelRetireHandler extends ChannelOwnerHandler<ChannelRetire> {
  readonly domain = 'jb:channel:retire:v1';
  decode(body: Uint8Array): ChannelRetire {
    return ChannelRetire.decode(body);
  }
  protected channel(body: ChannelRetire): string {
    return body.channel;
  }
  validate(body: ChannelRetire, env: ParsedEnvelope): ValidationResult {
    return !body.channel || body.channel !== env.scope
      ? invalid('body channel must equal envelope scope', 'channel')
      : valid;
  }
  async project(body: ChannelRetire, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const collection = this.projections.collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION);
    const current = await collection.findOne({ id: body.channel });
    if (!current) return;
    await collection.put(
      current.id,
      {
        ...current,
        retiredAtMs: Number(env.createdAtMs),
        retirementNote: body.note,
        successorKey: hex(body.successor_key),
      },
      tx,
    );
  }
}

export class ChannelVouchHandler implements DomainHandler<ChannelVouch> {
  readonly domain = 'jb:channel:vouch:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): ChannelVouch {
    return ChannelVouch.decode(body);
  }
  validate(body: ChannelVouch, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (body.level === VouchLevel.VOUCH_LEVEL_UNSPECIFIED) {
      return invalid('vouch level is required', 'level');
    }
    if (!body.basis.trim()) return invalid('vouch basis is required', 'basis');
    return valid;
  }
  async authorize(body: ChannelVouch): Promise<AuthDecision> {
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id: body.channel });
    return channel ? allowed : denied('channel is not known here');
  }
  async project(body: ChannelVouch, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const voucherKey = hex(env.authorKey);
    const id = `${body.channel}:${voucherKey}`;
    await this.projections
      .collection<SignalChannelVouchDoc>(SIGNAL_CHANNEL_VOUCHES_COLLECTION)
      .put(
        id,
        {
          id,
          channel: body.channel,
          voucherKey,
          level: body.level,
          basis: body.basis.trim(),
          assertedAtMs: Number(body.asserted_at_ms || env.createdAtMs),
          contentId: env.contentId,
        },
        tx,
      );
  }
}
