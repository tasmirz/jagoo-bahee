/**
 * T1.27 — `jb:attachment:claim:v1` (ATT-11, ATT-15, ATT-18).
 *
 * ── ATT-11: the content hash is INSIDE the signed claim ─────────────────────────────
 * v1 signed only the attachment ID, so a server could swap the stored blob and every
 * signature still verified — the picture people saw was not the picture the author
 * signed. Putting `content_sha256` in the signed body binds the bytes to the author's
 * signature, so substitution is detectable client-side without trusting the server.
 *
 * ── ATT-15: why the upload itself is not an envelope ────────────────────────────────
 * Steps 1-3 (presign, PUT, confirm) move BYTES and are ordinary HTTP. This envelope is the
 * signed STATEMENT — "I, this key, claim this blob with this hash". Bytes are not
 * statements, which is why the write endpoint stays the only place a statement enters.
 *
 * ── ATT-18: blobs are not federated ─────────────────────────────────────────────────
 * The claim travels; the bytes are fetched on demand from the origin and verified against
 * this hash on arrival. Replicating blobs to every peer would multiply storage across the
 * federation and saturate exactly the constrained links this system exists to survive.
 */

import { AttachmentClaim } from '@jagoo/sdk/proto';
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
import type { BlobStore } from '../../../core/ports/content.port.js';
import { hexKey } from '../shared/permissions.js';

export const ATTACHMENTS_COLLECTION = 'forum_attachments';
export const ATTACHMENT_UPLOADS_COLLECTION = 'forum_attachment_uploads';

/** ATT-07. 64 MiB — generous for a photo, far below anything that would hurt a Pi node. */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;

const ALLOWED_MIME = /^(image|video|audio|application|text)\/[a-zA-Z0-9.+-]+$/;

export interface AttachmentDoc {
  /** content ID of the AttachmentClaim envelope. */
  readonly id: string;
  readonly ownerKey: string;
  readonly storageKey: string;
  /** Hex SHA-256 of the blob. The binding that makes substitution detectable (ATT-11). */
  readonly contentSha256: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  /** ATT-12, and what renders when the blob is unavailable (ATT-19). */
  readonly altText: string;
  readonly kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  readonly scanStatus: 'unscanned';
  readonly createdAtMs: number;
}

export interface AttachmentUploadDoc {
  readonly id: string;
  readonly ownerKey: string;
  readonly storageKey: string;
  readonly contentSha256: string;
  readonly mime: string;
  readonly sizeBytes: number;
  readonly confirmedAtMs: number | null;
}

function kindForMime(mime: string): AttachmentDoc['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/octet-stream') return 'other';
  return 'document';
}

export class AttachmentClaimHandler implements DomainHandler<AttachmentClaim> {
  readonly domain = 'jb:attachment:claim:v1';
  readonly plane = Plane.FORUM;

  constructor(
    private readonly projections: ProjectionStore,
    private readonly blobs?: BlobStore,
  ) {}

  decode(body: Uint8Array): AttachmentClaim {
    return AttachmentClaim.decode(body);
  }

  validate(body: AttachmentClaim, _env: ParsedEnvelope): ValidationResult {
    if (!body.storage_key) return invalid('storage_key is required', 'storage_key');
    if (body.content_sha256.length !== 32) {
      return invalid('content_sha256 must be a 32-byte SHA-256 digest', 'content_sha256');
    }
    if (!ALLOWED_MIME.test(body.mime)) return invalid('mime type is not permitted', 'mime');
    if (body.size_bytes === 0n) return invalid('size_bytes is required', 'size_bytes');
    if (body.size_bytes > BigInt(MAX_ATTACHMENT_BYTES)) {
      return invalid(`attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`, 'size_bytes');
    }
    return valid;
  }

  async authorize(body: AttachmentClaim, env: ParsedEnvelope): Promise<AuthDecision> {
    // Rebuild calls project directly, so object storage remains outside derived state.
    // Live production registration always supplies BlobStore and verifies the upload.
    if (!this.blobs) return allowed;
    try {
      const upload = await this.projections
        .collection<AttachmentUploadDoc>(ATTACHMENT_UPLOADS_COLLECTION)
        .findOne({ id: body.storage_key });
      if (
        !upload ||
        upload.ownerKey !== hexKey(env.authorKey) ||
        upload.confirmedAtMs === null
      ) {
        return { allowed: false, reason: 'blob upload is not confirmed for this identity' };
      }
      const found = await this.blobs.confirm(body.storage_key);
      const matches =
        found.mime === body.mime &&
        found.size === Number(body.size_bytes) &&
        Buffer.from(found.sha256).equals(Buffer.from(body.content_sha256)) &&
        upload.mime === body.mime &&
        upload.sizeBytes === Number(body.size_bytes) &&
        upload.contentSha256 === Buffer.from(body.content_sha256).toString('hex');
      return matches
        ? allowed
        : { allowed: false, reason: 'blob metadata does not match the claim' };
    } catch {
      return { allowed: false, reason: 'blob has not been confirmed' };
    }
  }

  async project(body: AttachmentClaim, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: AttachmentDoc = {
      id: env.contentId,
      ownerKey: hexKey(env.authorKey),
      storageKey: body.storage_key,
      contentSha256: Buffer.from(body.content_sha256).toString('hex'),
      mime: body.mime,
      sizeBytes: Number(body.size_bytes),
      width: body.width,
      height: body.height,
      durationMs: body.duration_ms,
      altText: body.alt_text,
      kind: kindForMime(body.mime),
      scanStatus: 'unscanned',
      createdAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<AttachmentDoc>(ATTACHMENTS_COLLECTION).put(doc.id, doc, tx);
    await this.projections
      .collection<AttachmentUploadDoc>(ATTACHMENT_UPLOADS_COLLECTION)
      .delete(body.storage_key, tx);
  }
}
