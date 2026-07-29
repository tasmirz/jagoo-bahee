/**
 * T1.9 / T1.10 — `jb:key:certify:forum:v1`, `jb:key:revoke:forum:v1`.
 *
 * ── The bootstrap exception, and why it is safe (ADR-004) ───────────────────────────
 * Pipeline step 10 normally requires the author's key to already be certified. Applied to
 * a person's FIRST certificate that is circular: the key would have to be certified before
 * it could publish the certificate that certifies it. The registry row therefore sets
 * `requires_certificate: false` — a POLICY field the pipeline reads, not a domain branch.
 *
 * That exception is only safe because this handler re-establishes, by construction, every
 * property step 10 would have checked:
 *   · the certificate is ABOUT the key that signed the envelope — no certifying someone else
 *   · the Ed25519 self-signature verifies, so the key consented
 *   · the ML-DSA attestation verifies, so the PQ half is genuinely bound to the device key
 *   · the validity window contains the envelope's timestamp
 * A certificate failing any of these is rejected at step 15 and never reaches a projection.
 *
 * ── KY-02: duress revocation must be usable by someone else ─────────────────────────
 * A DURESS revocation is pre-signed while the person is safe and handed to a trusted
 * contact. The contact publishes it later — so the envelope's author key is deliberately
 * NOT required to equal the revoked key for that kind. Someone whose device has been seized
 * cannot sign anything, which is exactly when revocation matters most.
 */

import { KeyCertificate, KeyRevocation } from '@jagoo/sdk/proto';
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
import type { OperatorConfig } from '../../../core/ports/operator-config.port.js';
import { hexKey } from '../shared/permissions.js';
import {
  IDENTITIES_COLLECTION,
  MEMBERSHIPS_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION,
  membershipKey,
  roleAssignmentKey,
  type IdentityDoc,
  type MembershipDoc,
  type RoleAssignmentDoc,
} from '../shared/membership.projection.js';
import {
  CERTIFICATES_COLLECTION,
  REVOCATIONS_COLLECTION,
  RevocationKind,
  type CertificateDoc,
  type RevocationDoc,
} from './certificate.projection.js';
import { IdentityFlag } from '../shared/flags.js';

/** AUTH-13: certificates are long-lived but not eternal — an unbounded one cannot expire. */
const MAX_VALIDITY_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export class KeyCertifyHandler implements DomainHandler<KeyCertificate> {
  readonly domain = 'jb:key:certify:forum:v1';
  readonly plane = Plane.FORUM;

  constructor(
    private readonly projections: ProjectionStore,
    private readonly operatorConfig?: OperatorConfig,
  ) {}

  decode(body: Uint8Array): KeyCertificate {
    return KeyCertificate.decode(body);
  }

  /**
   * Everything step 10 would have checked, checked here instead. Pure — the signature
   * verification is arithmetic on the body's own bytes, with no I/O.
   */
  validate(body: KeyCertificate, env: ParsedEnvelope): ValidationResult {
    if (body.plane !== Plane.FORUM) {
      return invalid('a forum certificate must declare the FORUM plane', 'plane');
    }
    if (body.device_key.length !== 32) {
      return invalid('device_key must be a 32-byte Ed25519 key', 'device_key');
    }
    if (body.pq_key.length !== 1312) {
      return invalid('pq_key must be a 1312-byte ML-DSA-44 key', 'pq_key');
    }
    if (body.pq_attestation.length !== 2420) {
      return invalid('pq_attestation must be a 2420-byte ML-DSA-44 signature', 'pq_attestation');
    }
    if (body.self_signature.length !== 64) {
      return invalid('self_signature must be a 64-byte Ed25519 signature', 'self_signature');
    }

    // The certificate must be ABOUT the key that signed this envelope. Without this, any
    // certified key could publish a certificate for a key it does not control.
    if (!Buffer.from(body.device_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a certificate must be self-published by its own key', 'device_key');
    }

    if (body.valid_until <= body.valid_from) {
      return invalid('valid_until must be after valid_from', 'valid_until');
    }
    if (body.valid_until - body.valid_from > BigInt(MAX_VALIDITY_MS)) {
      return invalid('certificate validity window is too long', 'valid_until');
    }
    if (env.createdAtMs < body.valid_from || env.createdAtMs >= body.valid_until) {
      return invalid('certificate is not valid at its own publication time', 'valid_from');
    }

    const fields = {
      plane: body.plane as unknown as Plane,
      deviceKey: body.device_key,
      pqKey: body.pq_key,
      validFrom: body.valid_from,
      validUntil: body.valid_until,
    };

    // The PQ half. ML-DSA-44 is verified exactly once per identity, here, and never again
    // per message — that is the whole point of spending the post-quantum budget on a
    // cached certificate rather than on every signature (KY-05).
    const attestationOk = sdkCrypto.mldsa.verifyAttestation(
      body.pq_attestation,
      pqAttestationBytes(fields),
      body.pq_key,
    );
    if (!attestationOk) {
      return invalid('post-quantum attestation does not verify', 'pq_attestation');
    }

    const selfSignatureOk = sdkCrypto.ed25519.verify(
      body.self_signature,
      certificateSelfSignatureBytes(fields, body.pq_attestation),
      body.device_key,
    );
    if (!selfSignatureOk) {
      return invalid('certificate self-signature does not verify', 'self_signature');
    }

    return valid;
  }

  async authorize(_body: KeyCertificate, env: ParsedEnvelope): Promise<AuthDecision> {
    // A key already revoked for COMPROMISE cannot re-certify itself — otherwise whoever
    // stole it could undo the revocation.
    const revocation = await this.projections
      .collection<RevocationDoc>(REVOCATIONS_COLLECTION)
      .findOne({ id: hexKey(env.authorKey) });
    if (revocation && revocation.kind !== RevocationKind.ROTATE) {
      return denied('this key has been revoked and cannot be re-certified');
    }
    if (this.operatorConfig) {
      const existing = await this.projections
        .collection<CertificateDoc>(CERTIFICATES_COLLECTION)
        .findOne({ id: hexKey(env.authorKey) });
      if (!existing && !(await this.operatorConfig.security()).registrationsOpen) {
        return denied('new Forum identity registrations are closed on this node');
      }
    }
    return allowed;
  }

  async project(body: KeyCertificate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = hexKey(env.authorKey);
    const doc: CertificateDoc = {
      id,
      plane: body.plane,
      deviceKey: id,
      pqKey: Buffer.from(body.pq_key).toString('base64'),
      pqAttestation: Buffer.from(body.pq_attestation).toString('base64'),
      validFromMs: Number(body.valid_from),
      validUntilMs: Number(body.valid_until),
      selfSignature: Buffer.from(body.self_signature).toString('base64'),
      contentId: env.contentId,
      certifiedAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<CertificateDoc>(CERTIFICATES_COLLECTION).put(id, doc, tx);

    const identities = this.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION);
    const existingIdentity = await identities.findOne({ id });
    if (!existingIdentity) {
      await identities.put(
        id,
        {
          id,
          displayName: '',
          bio: '',
          avatar: '',
          banner: '',
          flags: IdentityFlag.ACTIVE.toString(),
          postKarma: 0,
          commentKarma: 0,
          firstSeenAtMs: Number(env.createdAtMs),
        },
        tx,
      );
    }
  }
}

export class KeyRevokeHandler implements DomainHandler<KeyRevocation> {
  readonly domain = 'jb:key:revoke:forum:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): KeyRevocation {
    return KeyRevocation.decode(body);
  }

  validate(body: KeyRevocation, env: ParsedEnvelope): ValidationResult {
    if (body.plane !== Plane.FORUM) {
      return invalid('a forum revocation must declare the FORUM plane', 'plane');
    }
    if (body.revoked_key.length !== 32) {
      return invalid('revoked_key must be a 32-byte Ed25519 key', 'revoked_key');
    }
    if (body.kind === RevocationKind.UNSPECIFIED) {
      return invalid('a revocation kind is required', 'kind');
    }
    if (body.kind === RevocationKind.ROTATE && body.replacement_key.length !== 32) {
      return invalid('a rotation must name its replacement key', 'replacement_key');
    }

    // Everything except DURESS must be self-published. DURESS is deliberately exempt: it
    // is pre-signed and published by a trusted contact on the owner's behalf (KY-02).
    const selfPublished = Buffer.from(body.revoked_key).equals(Buffer.from(env.authorKey));
    if (body.kind !== RevocationKind.DURESS && !selfPublished) {
      return invalid('only a duress revocation may be published by another key', 'revoked_key');
    }
    if (body.kind === RevocationKind.DURESS) {
      if (body.authorization_signature.length !== 64) {
        return invalid(
          'a duress revocation requires a 64-byte owner authorization',
          'authorization_signature',
        );
      }
      const authorized = sdkCrypto.ed25519.verify(
        body.authorization_signature,
        revocationAuthorizationBytes({
          plane: body.plane as unknown as Plane,
          revokedKey: body.revoked_key,
          kind: body.kind,
          effectiveFromMs: body.effective_from_ms,
          replacementKey: body.replacement_key,
        }),
        body.revoked_key,
      );
      if (!authorized) {
        return invalid('duress authorization does not verify', 'authorization_signature');
      }
    }

    return valid;
  }

  async authorize(_body: KeyRevocation, _env: ParsedEnvelope): Promise<AuthDecision> {
    // A revocation is always accepted. Refusing one would mean a node could keep a
    // compromised key alive, and KY-03 floods revocations at BROADCAST priority precisely
    // so no node can withhold them.
    return allowed;
  }

  async project(body: KeyRevocation, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const revokedKey = Buffer.from(body.revoked_key).toString('hex');
    const revocations = this.projections.collection<RevocationDoc>(REVOCATIONS_COLLECTION);

    // KY-01: the EARLIEST effective instant wins. A later revocation claiming a more
    // generous effective time must not be able to un-revoke a window already closed.
    const existing = await revocations.findOne({ id: revokedKey });
    const effectiveFromMs = Math.min(
      Number(body.effective_from_ms) || Number(env.createdAtMs),
      existing?.effectiveFromMs ?? Number.MAX_SAFE_INTEGER,
    );

    const doc: RevocationDoc = {
      id: revokedKey,
      plane: body.plane,
      revokedKey,
      kind: existing && existing.effectiveFromMs <= effectiveFromMs ? existing.kind : body.kind,
      effectiveFromMs,
      replacementKey:
        body.replacement_key.length > 0
          ? Buffer.from(body.replacement_key).toString('hex')
          : (existing?.replacementKey ?? ''),
      contentId: env.contentId,
      revokedAtMs: Number(env.createdAtMs),
    };
    await revocations.put(revokedKey, doc, tx);

    if (body.kind === RevocationKind.ROTATE && doc.replacementKey !== '') {
      await this.inheritStanding(revokedKey, doc.replacementKey, tx);
    }
  }

  /** KY-04: planned rotation changes the key, not the person's earned standing. */
  private async inheritStanding(revokedKey: string, replacementKey: string, tx: Tx): Promise<void> {
    const identities = this.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION);
    const identity = await identities.findOne({ id: revokedKey });
    if (identity) {
      await identities.put(replacementKey, { ...identity, id: replacementKey }, tx);
    }

    const memberships = this.projections.collection<MembershipDoc>(MEMBERSHIPS_COLLECTION);
    for (const membership of await memberships.find({ memberKey: revokedKey }, 100_000)) {
      await memberships.put(
        membershipKey(membership.community, replacementKey),
        {
          ...membership,
          id: membershipKey(membership.community, replacementKey),
          memberKey: replacementKey,
        },
        tx,
      );
    }

    const assignments = this.projections.collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION);
    for (const assignment of await assignments.find({ subjectKey: revokedKey }, 100_000)) {
      const id = roleAssignmentKey(assignment.community, replacementKey, assignment.role);
      await assignments.put(id, { ...assignment, id, subjectKey: replacementKey }, tx);
    }
  }
}
