import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // Enable automatic transformation and validation so DTO @Transform runs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  // Enable CORS for frontend. Set FRONTEND_ORIGIN in .env to restrict allowed origin(s).
  const frontendOrigin = process.env.FRONTEND_ORIGIN
  app.enableCors({ origin: frontendOrigin ? frontendOrigin.split(',') : true, credentials: true })
  // Setup Swagger UI at /api
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger')

  const config = new DocumentBuilder()
    .setTitle('Jagoo Bahee API')
    .setDescription('API documentation')
    .setVersion('1.0')
    // Add bearer token option so Swagger UI shows an Authorize button
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' }, 'JWT-auth')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document)
  // Serve generated swagger.json at /swagger.json for discovery by frontends
  const expressApp = app.getHttpAdapter().getInstance()
  expressApp.get('/swagger.json', (req, res) => {
    try {
      res.sendFile(require('path').resolve(process.cwd(), 'swagger.json'))
    } catch (e) {
      res.status(404).send('swagger.json not found')
    }
  })
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
