import Fastify, { type FastifyInstance } from 'fastify';
import { verifyAuditCertificate, type AuditCertificate } from '@jagoo/sdk';
import { AuditRecordStore } from './store.js';

export function createAuditLogServer(options?: {
  readonly dataFile?: string | null;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const store = new AuditRecordStore(
    options?.dataFile === undefined
      ? (process.env.ALS_DATA_FILE ?? './data/audit-log.jsonl')
      : options.dataFile,
  );

  app.get('/health', async () => {
    const summary = await store.summary();
    return { status: 'ok', service: 'jagoo-audit-log', ...summary };
  });

  app.post('/verify', async (request) => verifyAuditCertificate(request.body));

  app.post('/v1/audit-records', async (request, reply) => {
    const verification = verifyAuditCertificate(request.body);
    if (!verification.valid) {
      return reply.code(400).send(verification);
    }
    try {
      const stored = await store.append(request.body as AuditCertificate);
      return reply.code(stored.created ? 201 : 200).send({
        accepted: true,
        identifier: stored.record.certificate.identifier,
        observedAtMs: stored.record.observedAtMs,
        recordHash: stored.record.recordHash,
        chainHead: stored.record.recordHash,
        duplicate: !stored.created,
      });
    } catch (error) {
      return reply.code(409).send({
        accepted: false,
        detail: error instanceof Error ? error.message : 'audit record conflict',
      });
    }
  });

  app.get<{ Params: { identifier: string } }>(
    '/v1/audit-records/:identifier',
    async (request, reply) => {
      const items = await store.find(request.params.identifier);
      if (items.length === 0) {
        return reply.code(404).send({ detail: 'audit record not found' });
      }
      return { identifier: request.params.identifier, items };
    },
  );

  return app;
}
