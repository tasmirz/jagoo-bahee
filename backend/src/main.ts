import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './composition/app.module';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ bodyLimit: 65 * 1024 * 1024 });
  adapter
    .getInstance()
    .addContentTypeParser(
      'application/octet-stream',
      { parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  app.enableShutdownHooks();
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()) ?? true,
    credentials: true,
  });
  const openApi = new DocumentBuilder()
    .setTitle('Jagoo Bahee Node API')
    .setDescription(
      'Forum read, identity, anti-abuse, attachment, administration, and single-envelope write API.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApi);
  app
    .getHttpAdapter()
    .getInstance()
    .get('/docs-json', async (_request, reply) => {
      // This route is registered directly with Fastify after Nest builds the document,
      // so it does not cross the global Nest interceptor.
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'no-referrer');
      reply.header(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      );
      if (process.env.NODE_ENV === 'production') {
        reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
      }
      return document;
    });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
