import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

// T0.18: the composition root boots an empty node.
describe('AppModule', () => {
  it('boots with no ports bound', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication(new FastifyAdapter());
    await app.init();
    expect(app).toBeDefined();
    await app.close();
  });
});
