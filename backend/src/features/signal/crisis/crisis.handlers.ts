import {
  CheckIn,
  CheckInStatus,
  MissingPersonReport,
  MissingStatus,
  ResourceKind,
  ResourceReport,
  ResourceState,
} from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import type { GeoAreaDoc } from '../channel/channel.handlers.js';

export const SIGNAL_CHECKINS_COLLECTION = 'signal_checkins';
export const SIGNAL_LATEST_CHECKINS_COLLECTION = 'signal_latest_checkins';
export const SIGNAL_MISSING_COLLECTION = 'signal_missing_people';
export const SIGNAL_RESOURCES_COLLECTION = 'signal_resources';

export interface SignalCheckInDoc {
  readonly id: string;
  readonly authorKey: string;
  readonly status: CheckInStatus;
  readonly area: GeoAreaDoc | null;
  readonly note: string;
  readonly notifyKeys: readonly string[];
  readonly createdAtMs: number;
  readonly supersedes: string;
}

export interface SignalMissingPersonDoc {
  readonly id: string;
  readonly contentId: string;
  readonly reporterKey: string;
  readonly name: string;
  readonly age: number;
  readonly description: string;
  readonly lastSeenPlace: string;
  readonly lastSeenAtMs: number;
  readonly contactChannel: string;
  readonly photos: readonly string[];
  readonly status: MissingStatus;
  readonly reportedAtMs: number;
  readonly updatedAtMs: number;
}

export interface SignalResourceDoc {
  readonly id: string;
  readonly reporterKey: string;
  readonly kind: ResourceKind;
  readonly area: GeoAreaDoc | null;
  readonly detail: string;
  readonly state: ResourceState;
  readonly observedAtMs: number;
  readonly reportedAtMs: number;
}

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');
const area = (value: CheckIn['area']): GeoAreaDoc | null =>
  value
    ? {
        latE5: value.lat_e5,
        lonE5: value.lon_e5,
        radiusM: value.radius_m,
        placeName: value.place_name,
      }
    : null;

export class CheckInHandler implements DomainHandler<CheckIn> {
  readonly domain = 'jb:checkin:post:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): CheckIn {
    return CheckIn.decode(body);
  }
  validate(body: CheckIn): ValidationResult {
    if (body.status === CheckInStatus.CHECKIN_STATUS_UNSPECIFIED) {
      return invalid('check-in status is required', 'status');
    }
    if ([...body.note].length > 80) return invalid('note exceeds 80 characters', 'note');
    if (body.notify_keys.some((key) => key.length !== 32)) {
      return invalid('notify_keys must contain 32-byte keys', 'notify_keys');
    }
    return valid;
  }
  async authorize(): Promise<AuthDecision> {
    // CRS-03 / P4-G11: intentionally no permission, credit or credential gate.
    return allowed;
  }
  async project(body: CheckIn, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const authorKey = hex(env.authorKey);
    const latest =
      this.projections.collection<SignalCheckInDoc>(SIGNAL_LATEST_CHECKINS_COLLECTION);
    const previous = await latest.findOne({ id: authorKey });
    const doc: SignalCheckInDoc = {
      id: env.contentId,
      authorKey,
      status: body.status,
      area: area(body.area),
      note: body.note,
      notifyKeys: body.notify_keys.map(hex),
      createdAtMs: Number(env.createdAtMs),
      supersedes: previous?.id ?? '',
    };
    // CRS-04: history remains append-only while the latest projection is replaced.
    await this.projections
      .collection<SignalCheckInDoc>(SIGNAL_CHECKINS_COLLECTION)
      .put(doc.id, doc, tx);
    await latest.put(authorKey, { ...doc, id: authorKey }, tx);
  }
}

export class MissingPersonHandler implements DomainHandler<MissingPersonReport> {
  readonly domain = 'jb:missing:report:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): MissingPersonReport {
    return MissingPersonReport.decode(body);
  }
  validate(body: MissingPersonReport): ValidationResult {
    if (!body.name.trim()) return invalid('name is required', 'name');
    if (body.age > 130) return invalid('age is outside the supported range', 'age');
    if (body.status === MissingStatus.MISSING_STATUS_UNSPECIFIED) {
      return invalid('missing-person status is required', 'status');
    }
    if (body.photos.some((photo) => !photo.startsWith('jb1'))) {
      return invalid('photos must be content IDs', 'photos');
    }
    return valid;
  }
  async authorize(): Promise<AuthDecision> {
    return allowed;
  }
  async project(body: MissingPersonReport, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const reporterKey = hex(env.authorKey);
    const id = `${reporterKey}:${body.name.trim().normalize('NFKC').toLowerCase()}`;
    const collection =
      this.projections.collection<SignalMissingPersonDoc>(SIGNAL_MISSING_COLLECTION);
    const existing = await collection.findOne({ id });
    await collection.put(
      id,
      {
        id,
        contentId: env.contentId,
        reporterKey,
        name: body.name.trim(),
        age: body.age,
        description: body.description,
        lastSeenPlace: body.last_seen_place,
        lastSeenAtMs: Number(body.last_seen_at_ms),
        contactChannel: body.contact_channel,
        photos: [...body.photos],
        status: body.status,
        reportedAtMs: existing?.reportedAtMs ?? Number(env.createdAtMs),
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class ResourceReportHandler implements DomainHandler<ResourceReport> {
  readonly domain = 'jb:resource:report:v1';
  readonly plane = Plane.SIGNAL;
  constructor(private readonly projections: ProjectionStore) {}
  decode(body: Uint8Array): ResourceReport {
    return ResourceReport.decode(body);
  }
  validate(body: ResourceReport): ValidationResult {
    if (body.kind === ResourceKind.RESOURCE_KIND_UNSPECIFIED) {
      return invalid('resource kind is required', 'kind');
    }
    if (body.state === ResourceState.RESOURCE_STATE_UNSPECIFIED) {
      return invalid('resource state is required', 'state');
    }
    if (!body.area) return invalid('resource area is required', 'area');
    if (!body.detail.trim()) return invalid('resource detail is required', 'detail');
    return valid;
  }
  async authorize(): Promise<AuthDecision> {
    return allowed;
  }
  async project(body: ResourceReport, env: ParsedEnvelope, tx: Tx): Promise<void> {
    await this.projections
      .collection<SignalResourceDoc>(SIGNAL_RESOURCES_COLLECTION)
      .put(
        env.contentId,
        {
          id: env.contentId,
          reporterKey: hex(env.authorKey),
          kind: body.kind,
          area: area(body.area),
          detail: body.detail.trim(),
          state: body.state,
          observedAtMs: Number(body.observed_at_ms),
          reportedAtMs: Number(env.createdAtMs),
        },
        tx,
      );
  }
}
