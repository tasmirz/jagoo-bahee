import { Plane } from '@jagoo/sdk';
import type { MeshCertificateVerifier, MeshStore, StoredMeshEnvelope } from './mesh';
import { verifyPortableEnvelope } from './mesh';

export const JBPACK_MAX_BYTES = 16 * 1024 * 1024;
export const JBPACK_MAX_ENVELOPES = 10_000;
const text = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (value: Uint8Array): string =>
  globalThis
    .btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
const unbase64url = (value: string): Uint8Array =>
  Uint8Array.from(
    globalThis.atob(
      value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='),
    ),
    (character) => character.charCodeAt(0),
  );

export interface JbPack {
  readonly format: 'jagoo-bundle';
  readonly version: 1;
  readonly createdAtMs: number;
  readonly exporterKey?: string;
  readonly manifestSignature?: string;
  readonly envelopes: readonly { readonly contentId: string; readonly envelope: string }[];
}

export function createJbPack(
  rows: readonly Pick<StoredMeshEnvelope, 'contentId' | 'envelope'>[],
  createdAtMs = Date.now(),
): Uint8Array {
  if (rows.length > JBPACK_MAX_ENVELOPES) throw new Error('bundle exceeds 10000 envelopes');
  const pack: JbPack = {
    format: 'jagoo-bundle',
    version: 1,
    createdAtMs,
    envelopes: rows.map((row) => ({ contentId: row.contentId, envelope: row.envelope })),
  };
  const encoded = text.encode(JSON.stringify(pack));
  if (encoded.length > JBPACK_MAX_BYTES) throw new Error('bundle exceeds 16 MiB');
  return encoded;
}

export async function importJbPack(
  bytes: Uint8Array,
  store: MeshStore,
  verifyCertificate: MeshCertificateVerifier,
  nowMs = Date.now(),
): Promise<{ readonly imported: number; readonly duplicates: number; readonly rejected: number }> {
  if (bytes.length > JBPACK_MAX_BYTES) throw new Error('bundle exceeds 16 MiB');
  const pack = JSON.parse(decoder.decode(bytes)) as Partial<JbPack>;
  if (
    pack.format !== 'jagoo-bundle' ||
    pack.version !== 1 ||
    !Array.isArray(pack.envelopes) ||
    pack.envelopes.length > JBPACK_MAX_ENVELOPES
  ) {
    throw new Error('unsupported or malformed .jbpack');
  }
  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  for (const item of pack.envelopes) {
    try {
      const wire = unbase64url(item.envelope);
      const envelope = await verifyPortableEnvelope(
        wire,
        item.contentId,
        verifyCertificate,
      );
      const status = await store.put({
        contentId: item.contentId,
        envelope: item.envelope,
        plane: envelope.plane === Plane.FORUM ? Plane.FORUM : Plane.SIGNAL,
        priority: envelope.priority,
        originAtMs: Number(envelope.created_at_ms),
        expiresAtMs: nowMs + 72 * 60 * 60 * 1000,
        hops: 0,
        receivedAtMs: nowMs,
      });
      if (status === 'stored') imported += 1;
      else duplicates += 1;
    } catch {
      rejected += 1;
    }
  }
  return { imported, duplicates, rejected };
}

export function jbpackEnvelopeBytes(value: string): Uint8Array {
  return unbase64url(value);
}

export function jbpackEnvelopeString(value: Uint8Array): string {
  return base64url(value);
}
