import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('/auth/challenge (GET) returns a challenge', async () => {
    const response = await request(app.getHttpServer() as any)
      .get('/auth/challenge')
      .expect(200);

    expect(typeof response.text).toBe('string');
    expect(response.text.length).toBeGreaterThan(10);
  });

  it('/auth (POST) fails with invalid challenge', async () => {
    const challengeRes = await request(app.getHttpServer() as any)
      .get('/auth/challenge')
      .expect(200);

    await request(app.getHttpServer() as any)
      .post('/auth')
      .send({
        publicKey: 'aW52YWxpZA==',
        signedData: 'aW52YWxpZA==',
        challenge: challengeRes.text,
        nonce: 0
      })
      .expect(401);
  });
});
