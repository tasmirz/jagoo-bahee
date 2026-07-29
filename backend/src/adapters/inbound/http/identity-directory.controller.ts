import { Controller, Get, Inject, Query } from '@nestjs/common';
// A VALUE import, not `import type`. Ports are abstract classes precisely so they can be DI
// tokens (ADR-002); `import type` erases the class at runtime, Nest is left with no token,
// and the container fails to boot with "can't resolve dependencies … argument Function at
// index [0]". Under vitest it does not fail at all — esbuild drops the decorator metadata,
// the dependency silently arrives as `undefined`, and the module spec passes (L-15). So the
// in-process suite cannot see this, and only running the image does (L-20).
import { ProjectionStore } from '../../../core/ports/storage.port.js';
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
  constructor(@Inject(ProjectionStore) private readonly projections: ProjectionStore) {}

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
