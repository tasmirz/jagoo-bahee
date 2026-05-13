import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']);
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();
    } catch (e) {
      console.error('Nest Testing Error:', e);
      throw e;
    }
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer() as any)
      .get('/')
      .expect(200)
      .expect('Jagoo Bahee API');
  });

  it('/attachments (GET) rejects anonymous callers', () => {
    return request(app.getHttpServer() as any)
      .get('/attachments')
      .expect(401);
  });

  it('/audit/receipts/verify rejects tampered payload hashes', async () => {
    const canonicalPayload = JSON.stringify({ id: 'post-1', content: 'original' });
    const receipt = {
      receiptVersion: 1,
      serverId: 'http://localhost:6000',
      serverBaseUrl: 'http://localhost:6000',
      keyId: 'test-key',
      action: 'post.created',
      subjectType: 'post',
      subjectId: '665b3f2a9c5a7d0012a1b300',
      contentType: 'post',
      contentId: '665b3f2a9c5a7d0012a1b300',
      actorPublicKey: '',
      userPublicKey: '',
      canonicalPayload: JSON.stringify({ id: 'post-1', content: 'tampered' }),
      payloadHash: require('crypto').createHash('sha256').update(canonicalPayload).digest('hex'),
      actorSignature: '',
      userSignature: '',
      serverSignature: 'invalid'
    };

    const res = await request(app.getHttpServer() as any)
      .post('/audit/receipts/verify')
      .send(receipt)
      .expect(201);

    expect(res.body.ok).toBe(false);
    expect(res.body.payloadOk).toBe(false);
  });
});
