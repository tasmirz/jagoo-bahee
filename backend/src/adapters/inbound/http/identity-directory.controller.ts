import { Controller, Get, Query } from '@nestjs/common';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import {
  CERTIFICATES_COLLECTION,
  REVOCATIONS_COLLECTION,
  type CertificateDoc,
  type RevocationDoc,
} from '../../../features/forum/identity/certificate.projection.js';
import {
  SIGNAL_CERTIFICATES_COLLECTION,
  SIGNAL_REVOCATIONS_COLLECTION,
  type SignalCertificateDoc,
  type SignalRevocationDoc,
} from '../../../features/signal/identity/certificate.projection.js';

const MAX_DIRECTORY = 10_000;

/** TP-05/P5: public, pre-positionable certificate material for offline mesh verification. */
@Controller('v1/identity')
export class IdentityDirectoryController {
  constructor(private readonly projections: ProjectionStore) {}

  @Get('certificates')
  async certificates(@Query('plane') plane = 'SIGNAL'): Promise<Record<string, unknown>> {
    const signal = plane.toUpperCase() === 'SIGNAL';
    const certificates = signal
      ? await this.projections
          .collection<SignalCertificateDoc>(SIGNAL_CERTIFICATES_COLLECTION)
          .find({}, MAX_DIRECTORY)
      : await this.projections
          .collection<CertificateDoc>(CERTIFICATES_COLLECTION)
          .find({}, MAX_DIRECTORY);
    const revocations = signal
      ? await this.projections
          .collection<SignalRevocationDoc>(SIGNAL_REVOCATIONS_COLLECTION)
          .find({}, MAX_DIRECTORY)
      : await this.projections
          .collection<RevocationDoc>(REVOCATIONS_COLLECTION)
          .find({}, MAX_DIRECTORY);
    return { plane: signal ? 'SIGNAL' : 'FORUM', certificates, revocations };
  }
}
