import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ENVELOPE_VERSION,
  Plane,
  Priority,
  contentId,
  decodeSignedEnvelope,
  encodeSignedEnvelope,
  lookupDomain,
  verifyEnvelope,
  type SignedEnvelope,
} from '@jagoo/sdk';

export const MESH_VERSION = 1 as const;
export const MESH_MAX_FRAME_BYTES = 65_536;
export const MESH_MAX_HOPS = 8;
export const MESH_MAX_TTL_MS = 72 * 60 * 60 * 1000;
const FORUM_STORE = 'jb.mesh.forum.v1';
const SIGNAL_STORE = 'jb.mesh.signal.v1';
const text = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (value: Uint8Array): string =>
  globalThis
    .btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
const unbase64url = (value: string): Uint8Array => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(globalThis.atob(base64), (character) => character.charCodeAt(0));
};

export type MeshFrame =
  | {
      readonly version: 1;
      readonly kind: 'hello';
      readonly peerId: string;
      readonly nonce: string;
      readonly maxFrameBytes: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'summary';
      readonly bloom: string;
      readonly count: number;
      readonly generatedAtMs: number;
    }
  | { readonly version: 1; readonly kind: 'want'; readonly contentIds: readonly string[] }
  | {
      readonly version: 1;
      readonly kind: 'envelope';
      readonly contentId: string;
      readonly envelope: string;
      readonly originAtMs: number;
      readonly expiresAtMs: number;
      readonly hops: number;
    }
  | {
      readonly version: 1;
      readonly kind: 'ack';
      readonly contentId: string;
      readonly status: 'stored' | 'duplicate' | 'rejected';
      readonly error?: string;
    };

export interface StoredMeshEnvelope {
  readonly contentId: string;
  readonly envelope: string;
  readonly plane: Plane;
  readonly priority: Priority;
  readonly originAtMs: number;
  readonly expiresAtMs: number;
  readonly hops: number;
  readonly receivedAtMs: number;
}

export interface MeshPairing {
  readonly version: 1;
  readonly peerId: string;
  readonly role: 'offer' | 'answer';
  readonly sessionDescription: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function encodeMeshFrame(frame: MeshFrame): string {
  const encoded = JSON.stringify(frame);
  if (text.encode(encoded).length > MESH_MAX_FRAME_BYTES) throw new Error('mesh frame exceeds 65536 bytes');
  return encoded;
}

export function decodeMeshFrame(encoded: string): MeshFrame {
  if (text.encode(encoded).length > MESH_MAX_FRAME_BYTES) throw new Error('mesh frame exceeds 65536 bytes');
  const value = JSON.parse(encoded) as Partial<MeshFrame>;
  if (value.version !== 1 || typeof value.kind !== 'string') throw new Error('unsupported mesh frame');
  if (value.kind === 'want' && ((value.contentIds?.length ?? 0) > 128)) {
    throw new Error('mesh want frame exceeds 128 IDs');
  }
  return value as MeshFrame;
}

export function encodeMeshPairing(value: MeshPairing): string {
  return base64url(text.encode(JSON.stringify(value)));
}

export function decodeMeshPairing(value: string, nowMs = Date.now()): MeshPairing {
  const pairing = JSON.parse(decoder.decode(unbase64url(value))) as MeshPairing;
  if (
    pairing.version !== 1 ||
    !['offer', 'answer'].includes(pairing.role) ||
    !pairing.peerId ||
    text.encode(pairing.peerId).length > 80 ||
    pairing.expiresAtMs <= nowMs ||
    pairing.expiresAtMs > nowMs + 10 * 60 * 1000
  ) {
    throw new Error('pairing payload is invalid or expired');
  }
  return pairing;
}

export type MeshCertificateVerifier = (envelope: SignedEnvelope) => Promise<boolean>;

/**
 * Class 0–2 portable ingress. Contextual credit/nullifier gates never occur in these P5 mesh
 * classes; certificate validation is supplied by the plane-specific cached certificate store.
 */
export async function verifyPortableEnvelope(
  wireBytes: Uint8Array,
  expectedContentId: string,
  verifyCertificate: MeshCertificateVerifier,
  allowBulk = true,
): Promise<SignedEnvelope> {
  const envelope = decodeSignedEnvelope(wireBytes);
  const spec = lookupDomain(envelope.domain);
  if (!spec) throw new Error('UNKNOWN_DOMAIN');
  if (wireBytes.length > spec.maxBytes) throw new Error('TOO_LARGE');
  if (envelope.version !== ENVELOPE_VERSION) throw new Error('VERSION_UNSUPPORTED');
  if ((spec.plane === 'FORUM' ? Plane.FORUM : Plane.SIGNAL) !== envelope.plane) {
    throw new Error('PLANE_MISMATCH');
  }
  const priorities: Record<string, Priority> = {
    BROADCAST: Priority.BROADCAST,
    DIRECT: Priority.DIRECT,
    CHECKIN: Priority.CHECKIN,
    BULK: Priority.BULK,
  };
  if (priorities[spec.priority] !== envelope.priority) throw new Error('PRIORITY_MISMATCH');
  if (!allowBulk && envelope.priority === Priority.BULK) throw new Error('TRANSPORT_UNSUPPORTED');
  if (!equal(encodeSignedEnvelope(envelope), wireBytes)) throw new Error('NON_CANONICAL');
  if (contentId(envelope) !== expectedContentId) throw new Error('CONTENT_ID_MISMATCH');
  if (!verifyEnvelope(envelope)) throw new Error('SIGNATURE_INVALID');
  if (spec.requiresCertificate && !(await verifyCertificate(envelope))) {
    throw new Error('CERT_INVALID');
  }
  return envelope;
}

export async function verifyMeshEnvelope(
  wireBytes: Uint8Array,
  expectedContentId: string,
  verifyCertificate: MeshCertificateVerifier,
): Promise<SignedEnvelope> {
  return verifyPortableEnvelope(wireBytes, expectedContentId, verifyCertificate, false);
}

async function readPlane(plane: Plane): Promise<readonly StoredMeshEnvelope[]> {
  const encoded = await AsyncStorage.getItem(plane === Plane.FORUM ? FORUM_STORE : SIGNAL_STORE);
  if (!encoded) return [];
  try {
    return JSON.parse(encoded) as readonly StoredMeshEnvelope[];
  } catch {
    return [];
  }
}

async function writePlane(plane: Plane, rows: readonly StoredMeshEnvelope[]): Promise<void> {
  await AsyncStorage.setItem(
    plane === Plane.FORUM ? FORUM_STORE : SIGNAL_STORE,
    JSON.stringify(rows),
  );
}

export class MeshStore {
  async list(plane?: Plane): Promise<readonly StoredMeshEnvelope[]> {
    return plane
      ? readPlane(plane)
      : [...(await readPlane(Plane.FORUM)), ...(await readPlane(Plane.SIGNAL))];
  }

  async has(identifier: string): Promise<boolean> {
    return (await this.list()).some((row) => row.contentId === identifier);
  }

  async put(value: StoredMeshEnvelope): Promise<'stored' | 'duplicate'> {
    const rows = await readPlane(value.plane);
    if (rows.some((row) => row.contentId === value.contentId)) return 'duplicate';
    await writePlane(value.plane, [...rows, value]);
    return 'stored';
  }

  async clearPlane(plane: Plane): Promise<void> {
    await AsyncStorage.removeItem(plane === Plane.FORUM ? FORUM_STORE : SIGNAL_STORE);
  }
}

function hash(value: string, seed: number): number {
  let result = (2166136261 ^ seed) >>> 0;
  for (const byte of text.encode(value)) {
    result ^= byte;
    result = Math.imul(result, 16777619) >>> 0;
  }
  return result;
}

export class MeshBloom {
  private readonly bits: Uint8Array;

  constructor(encoded?: string, readonly byteLength = 256) {
    this.bits = encoded ? unbase64url(encoded) : new Uint8Array(byteLength);
    if (this.bits.length !== byteLength) throw new Error('invalid mesh bloom length');
  }

  add(value: string): void {
    for (let seed = 0; seed < 5; seed += 1) {
      const position = hash(value, seed) % (this.bits.length * 8);
      this.bits[Math.floor(position / 8)]! |= 1 << (position % 8);
    }
  }

  has(value: string): boolean {
    for (let seed = 0; seed < 5; seed += 1) {
      const position = hash(value, seed) % (this.bits.length * 8);
      if ((this.bits[Math.floor(position / 8)]! & (1 << (position % 8))) === 0) return false;
    }
    return true;
  }

  encode(): string {
    return base64url(this.bits);
  }
}

interface PeerWindow {
  startedAtMs: number;
  envelopes: number;
  bytes: number;
}

export class MeshRouter {
  private readonly quotas = new Map<string, PeerWindow>();

  constructor(
    private readonly store: MeshStore,
    private readonly verifyCertificate: MeshCertificateVerifier,
  ) {}

  async summary(
    nowMs = Date.now(),
    additionalContentIds: readonly string[] = [],
  ): Promise<MeshFrame> {
    const rows = (await this.store.list()).filter((row) => row.expiresAtMs > nowMs);
    const bloom = new MeshBloom();
    rows.forEach((row) => bloom.add(row.contentId));
    additionalContentIds.forEach((identifier) => bloom.add(identifier));
    return {
      version: 1,
      kind: 'summary',
      bloom: bloom.encode(),
      count: rows.length + additionalContentIds.length,
      generatedAtMs: nowMs,
    };
  }

  async missingForPeer(
    summary: Extract<MeshFrame, { kind: 'summary' }>,
  ): Promise<readonly StoredMeshEnvelope[]> {
    const remote = new MeshBloom(summary.bloom);
    return (await this.store.list())
      .filter((row) => !remote.has(row.contentId))
      .slice(0, 128);
  }

  private spend(peerId: string, bytes: number, nowMs: number): void {
    const previous = this.quotas.get(peerId);
    const window =
      !previous || nowMs - previous.startedAtMs >= 60 * 60 * 1000
        ? { startedAtMs: nowMs, envelopes: 0, bytes: 0 }
        : previous;
    if (window.envelopes >= 1_000 || window.bytes + bytes > 8 * 1024 * 1024) {
      throw new Error('MESH_QUOTA');
    }
    this.quotas.set(peerId, {
      ...window,
      envelopes: window.envelopes + 1,
      bytes: window.bytes + bytes,
    });
  }

  async receive(
    peerId: string,
    frame: Extract<MeshFrame, { kind: 'envelope' }>,
    nowMs = Date.now(),
  ): Promise<{
    readonly ack: Extract<MeshFrame, { kind: 'ack' }>;
    readonly relay: Extract<MeshFrame, { kind: 'envelope' }> | null;
  }> {
    try {
      if (frame.hops < 0 || frame.hops >= MESH_MAX_HOPS) throw new Error('HOP_LIMIT');
      if (
        frame.expiresAtMs <= nowMs ||
        frame.expiresAtMs - frame.originAtMs > MESH_MAX_TTL_MS ||
        frame.originAtMs > nowMs + 5 * 60 * 1000
      ) {
        throw new Error('TTL_EXPIRED');
      }
      const wire = unbase64url(frame.envelope);
      this.spend(peerId, wire.length, nowMs);
      const envelope = await verifyMeshEnvelope(
        wire,
        frame.contentId,
        this.verifyCertificate,
      );
      const status = await this.store.put({
        contentId: frame.contentId,
        envelope: frame.envelope,
        plane: envelope.plane,
        priority: envelope.priority,
        originAtMs: frame.originAtMs,
        expiresAtMs: frame.expiresAtMs,
        hops: frame.hops,
        receivedAtMs: nowMs,
      });
      return {
        ack: { version: 1, kind: 'ack', contentId: frame.contentId, status },
        relay: status === 'stored' ? { ...frame, hops: frame.hops + 1 } : null,
      };
    } catch (error) {
      return {
        ack: {
          version: 1,
          kind: 'ack',
          contentId: frame.contentId,
          status: 'rejected',
          error: error instanceof Error ? error.message : 'INVALID',
        },
        relay: null,
      };
    }
  }
}

export function meshEnvelopeFrame(
  wireBytes: Uint8Array,
  identifier: string,
  nowMs = Date.now(),
): Extract<MeshFrame, { kind: 'envelope' }> {
  return {
    version: 1,
    kind: 'envelope',
    contentId: identifier,
    envelope: base64url(wireBytes),
    originAtMs: nowMs,
    expiresAtMs: nowMs + MESH_MAX_TTL_MS,
    hops: 0,
  };
}
