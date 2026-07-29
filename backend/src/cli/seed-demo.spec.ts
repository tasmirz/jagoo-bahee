import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../composition/app.module.js';
import { CredentialIssuer } from '../core/ports/anti-abuse.port.js';
import { RsaBlindCredentialIssuer } from '../adapters/outbound/redis/rsa-blind-credentials.js';
import { seedDemo } from './seed-demo.js';

describe('dependency-free local demo', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CredentialIssuer)
      .useValue(RsaBlindCredentialIssuer.generate())
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { readonly port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app.close());

  it('certifies, authenticates, creates a community, publishes, and reads a signed post', async () => {
    const contentId = await seedDemo(baseUrl);
    const [feedResponse, communitiesResponse] = await Promise.all([
      fetch(`${baseUrl}/v1/feed`),
      fetch(`${baseUrl}/v1/communities?q=welcome`),
    ]);
    const feed = (await feedResponse.json()) as {
      readonly items: readonly { readonly contentId: string; readonly provenance: unknown }[];
    };
    const communities = (await communitiesResponse.json()) as {
      readonly items: readonly { readonly name: string }[];
    };

    expect(feedResponse.ok).toBe(true);
    expect(feed.items).toEqual([
      expect.objectContaining({ contentId, provenance: expect.any(Object) }),
    ]);
    expect(communities.items).toContainEqual(expect.objectContaining({ name: 'welcome' }));
  });
});
