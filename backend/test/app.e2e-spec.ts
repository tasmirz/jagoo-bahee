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
});
