import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import {
  verifyAuditCertificate,
  type AuditCertificate,
  type AuditCertificateVerification,
} from '@jagoo/sdk';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { EnvelopeReader, ProjectionStore } from '../../../core/ports/storage.port.js';

interface RemovableProjection {
  readonly removed: boolean;
  readonly removedReason: string | null;
}

@Controller()
export class EvidenceController {
  constructor(
    @Inject(EnvelopeReader) private readonly envelopes: EnvelopeReader,
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
    @Inject(NodeSigner) private readonly signer: NodeSigner,
  ) {}

  @Post('verify')
  @HttpCode(200)
  verify(@Body() certificate: unknown): AuditCertificateVerification {
    return verifyAuditCertificate(certificate);
  }

  @Post('status')
  @HttpCode(200)
  async status(@Body() value: unknown): Promise<Record<string, unknown>> {
    const verification = verifyAuditCertificate(value);
    if (!verification.valid || !verification.identifier) {
      throw new HttpException(verification, 400);
    }
    const certificate = value as AuditCertificate;
    if (certificate.acknowledgement.server_id !== this.signer.serverId) {
      return {
        ...verification,
        status: 'unknown_server',
        online: true,
        reason: 'This certificate was issued by a different node.',
      };
    }

    const stored = await this.envelopes.get(verification.identifier);
    if (!stored) {
      return {
        ...verification,
        status: 'deleted',
        online: true,
        reason:
          'The node acknowledged this action, but its envelope is no longer present. No signed deletion reason is available.',
      };
    }

    const domain = stored.envelope.domain;
    const post =
      domain === 'jb:post:create:v1'
        ? await this.projections
            .collection<RemovableProjection>('forum_posts')
            .findOne({ id: verification.identifier })
        : null;
    const comment =
      domain === 'jb:comment:create:v1'
        ? await this.projections
            .collection<RemovableProjection>('forum_comments')
            .findOne({ id: verification.identifier })
        : null;
    if (
      (domain === 'jb:post:create:v1' && !post) ||
      (domain === 'jb:comment:create:v1' && !comment)
    ) {
      return {
        ...verification,
        status: 'deleted',
        online: true,
        reason:
          'The node still has the acknowledged envelope, but its rendered content projection is missing. No signed deletion reason is available.',
      };
    }
    const projected = post ?? comment;
    if (projected?.removed) {
      return {
        ...verification,
        status: 'hidden',
        online: true,
        reason: projected.removedReason ?? 'Hidden without a public reason.',
      };
    }

    return {
      ...verification,
      status: 'online',
      online: true,
      reason: null,
      acceptedAtMs: certificate.acknowledgement.accepted_at_ms,
    };
  }
}
