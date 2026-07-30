import {
  KeyCertificate,
  KeyRevocation,
  RevocationKind,
} from '@jagoo/sdk/proto';
import {
  certificateSelfSignatureBytes,
  crypto as sdkCrypto,
  pqAttestationBytes,
  revocationAuthorizationBytes,
} from '@jagoo/sdk';
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
import {
  SIGNAL_CERTIFICATES_COLLECTION,
  SIGNAL_REVOCATIONS_COLLECTION,
  type SignalCertificateDoc,
  type SignalRevocationDoc,
} from './certificate.projection.js';

const MAX_VALIDITY_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

export class SignalKeyCertifyHandler implements DomainHandler<KeyCertificate> {
  readonly domain = 'jb:key:certify:signal:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): KeyCertificate {
    return KeyCertificate.decode(body);
  }

  validate(body: KeyCertificate, env: ParsedEnvelope): ValidationResult {
    if (body.plane !== Plane.SIGNAL) {
      return invalid('a Signal certificate must declare the SIGNAL plane', 'plane');
    }
    if (body.device_key.length !== 32) {
      return invalid('device_key must be a 32-byte Ed25519 key', 'device_key');
    }
    if (body.pq_key.length !== 1312 || body.pq_attestation.length !== 2420) {
      return invalid('a valid ML-DSA-44 key and attestation are required', 'pq_key');
    }
    if (body.self_signature.length !== 64) {
      return invalid('self_signature must be a 64-byte Ed25519 signature', 'self_signature');
    }
    if (!Buffer.from(body.device_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a certificate must be self-published by its own key', 'device_key');
    }
    if (
      body.valid_until <= body.valid_from ||
      body.valid_until - body.valid_from > BigInt(MAX_VALIDITY_MS) ||
      env.createdAtMs < body.valid_from ||
      env.createdAtMs >= body.valid_until
    ) {
      return invalid('certificate validity window is invalid', 'valid_until');
    }
    const fields = {
      plane: Plane.SIGNAL,
      deviceKey: body.device_key,
      pqKey: body.pq_key,
      validFrom: BigInt(body.valid_from),
      validUntil: BigInt(body.valid_until),
    };
    if (
      !sdkCrypto.mldsa.verifyAttestation(
        body.pq_attestation,
        pqAttestationBytes(fields),
        body.pq_key,
      )
    ) {
      return invalid('post-quantum attestation does not verify', 'pq_attestation');
    }
    if (
      !sdkCrypto.ed25519.verify(
        body.self_signature,
        certificateSelfSignatureBytes(fields, body.pq_attestation),
        body.device_key,
      )
    ) {
      return invalid('certificate self-signature does not verify', 'self_signature');
    }
    return valid;
  }

  async authorize(_body: KeyCertificate, env: ParsedEnvelope): Promise<AuthDecision> {
    const revocation = await this.projections
      .collection<SignalRevocationDoc>(SIGNAL_REVOCATIONS_COLLECTION)
      .findOne({ id: hex(env.authorKey) });
    return revocation && revocation.kind !== RevocationKind.REVOCATION_KIND_ROTATE
      ? denied('this Signal key has been revoked')
      : allowed;
  }

  async project(body: KeyCertificate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = hex(env.authorKey);
    await this.projections
      .collection<SignalCertificateDoc>(SIGNAL_CERTIFICATES_COLLECTION)
      .put(
        id,
        {
          id,
          plane: Plane.SIGNAL,
          deviceKey: id,
          pqKey: Buffer.from(body.pq_key).toString('base64'),
          pqAttestation: Buffer.from(body.pq_attestation).toString('base64'),
          validFromMs: Number(body.valid_from),
          validUntilMs: Number(body.valid_until),
          selfSignature: Buffer.from(body.self_signature).toString('base64'),
          contentId: env.contentId,
          certifiedAtMs: Number(env.createdAtMs),
        },
        tx,
      );
  }
}

export class SignalKeyRevokeHandler implements DomainHandler<KeyRevocation> {
  readonly domain = 'jb:key:revoke:signal:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): KeyRevocation {
    return KeyRevocation.decode(body);
  }

  validate(body: KeyRevocation, env: ParsedEnvelope): ValidationResult {
    if (body.plane !== Plane.SIGNAL) {
      return invalid('a Signal revocation must declare the SIGNAL plane', 'plane');
    }
    if (body.revoked_key.length !== 32) {
      return invalid('revoked_key must be a 32-byte Ed25519 key', 'revoked_key');
    }
    if (body.kind === RevocationKind.REVOCATION_KIND_UNSPECIFIED) {
      return invalid('a revocation kind is required', 'kind');
    }
    const selfPublished = Buffer.from(body.revoked_key).equals(Buffer.from(env.authorKey));
    if (body.kind !== RevocationKind.REVOCATION_KIND_DURESS && !selfPublished) {
      return invalid('only a duress revocation may be published by another key', 'revoked_key');
    }
    if (
      body.kind === RevocationKind.REVOCATION_KIND_DURESS &&
      (body.authorization_signature.length !== 64 ||
        !sdkCrypto.ed25519.verify(
          body.authorization_signature,
          revocationAuthorizationBytes({
            plane: Plane.SIGNAL,
            revokedKey: body.revoked_key,
            kind: body.kind,
            effectiveFromMs: body.effective_from_ms,
            replacementKey: body.replacement_key,
          }),
          body.revoked_key,
        ))
    ) {
      return invalid('duress authorization does not verify', 'authorization_signature');
    }
    return valid;
  }

  async authorize(): Promise<AuthDecision> {
    return allowed;
  }

  async project(body: KeyRevocation, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = hex(body.revoked_key);
    const collection =
      this.projections.collection<SignalRevocationDoc>(SIGNAL_REVOCATIONS_COLLECTION);
    const existing = await collection.findOne({ id });
    const effectiveFromMs = Math.min(
      Number(body.effective_from_ms) || Number(env.createdAtMs),
      existing?.effectiveFromMs ?? Number.MAX_SAFE_INTEGER,
    );
    await collection.put(
      id,
      {
        id,
        plane: Plane.SIGNAL,
        revokedKey: id,
        kind: existing && existing.effectiveFromMs <= effectiveFromMs ? existing.kind : body.kind,
        effectiveFromMs,
        replacementKey:
          body.replacement_key.length > 0
            ? hex(body.replacement_key)
            : (existing?.replacementKey ?? ''),
        contentId: env.contentId,
        revokedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}
