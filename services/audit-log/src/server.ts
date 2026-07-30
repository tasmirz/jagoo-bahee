import Fastify, { type FastifyInstance } from 'fastify';
import { verifyAuditCertificate, type AuditCertificate } from '@jagoo/sdk';
import {
  AuditIssueStore,
  AuditRecordStore,
  type AuditIssueReport,
} from './store.js';

export function createAuditLogServer(options?: {
  readonly dataFile?: string | null;
  readonly issuesDataFile?: string | null;
}): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  const dataFile =
    options?.dataFile === undefined
      ? (process.env.ALS_DATA_FILE ?? './data/audit-log.jsonl')
      : options.dataFile;
  const store = new AuditRecordStore(dataFile);
  const issues = new AuditIssueStore(
    options?.issuesDataFile === undefined
      ? (process.env.ALS_ISSUES_DATA_FILE ?? (dataFile ? `${dataFile}.issues` : null))
      : options.issuesDataFile,
  );

  app.get('/health', async () => {
    const [summary, issueSummary] = await Promise.all([store.summary(), issues.summary()]);
    return { status: 'ok', service: 'jagoo-audit-log', ...summary, ...issueSummary };
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

  app.post('/v1/audit-reports', async (request, reply) => {
    const report = request.body as Partial<AuditIssueReport> | null;
    const allowedIssues = new Set([
      'CONTENT_IDENTIFIER',
      'AUTHOR_SIGNATURE',
      'PUBLICATION_RECEIPT',
    ]);
    if (
      report?.version !== 1 ||
      typeof report.reportId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(report.reportId) ||
      typeof report.identifier !== 'string' ||
      report.identifier.length === 0 ||
      !Array.isArray(report.issues) ||
      report.issues.length === 0 ||
      !report.issues.every((issue) => typeof issue === 'string' && allowedIssues.has(issue)) ||
      typeof report.observedAtMs !== 'number' ||
      !Number.isSafeInteger(report.observedAtMs) ||
      report.observedAtMs < 0 ||
      report.evidence == null ||
      typeof report.evidence !== 'object'
    ) {
      return reply.code(400).send({ accepted: false, detail: 'audit issue report is invalid' });
    }
    try {
      const stored = await issues.append(report as AuditIssueReport);
      return reply.code(stored.created ? 201 : 200).send({
        accepted: true,
        reportId: stored.record.report.reportId,
        identifier: stored.record.report.identifier,
        receivedAtMs: stored.record.receivedAtMs,
        recordHash: stored.record.recordHash,
        duplicate: !stored.created,
      });
    } catch (error) {
      return reply.code(409).send({
        accepted: false,
        detail: error instanceof Error ? error.message : 'audit issue conflict',
      });
    }
  });

  app.get<{ Params: { identifier: string } }>(
    '/v1/audit-reports/:identifier',
    async (request, reply) => {
      const items = await issues.find(request.params.identifier);
      if (items.length === 0) {
        return reply.code(404).send({ detail: 'audit issue report not found' });
      }
      return { identifier: request.params.identifier, items };
    },
  );

  return app;
}
