import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor'
import { validateProductionConfig } from './common/startup-validation'

async function bootstrap() {
  validateProductionConfig()
  const app = await NestFactory.create(AppModule)
  // Enable 'trust proxy' for reliable IP detection
  const expressApp = app.getHttpAdapter().getInstance()
  expressApp.set('trust proxy', true)
  // Enable automatic transformation and validation so DTO @Transform runs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  // Register global interceptor for BigInt serialization
  app.useGlobalInterceptors(new BigIntInterceptor())
  // Enable CORS for frontend. Set FRONTEND_ORIGIN in .env to restrict allowed origin(s).
  const frontendOrigin = process.env.FRONTEND_ORIGIN
  app.enableCors({
    origin: frontendOrigin ? frontendOrigin.split(',') : process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
  })

  if (process.env.ENABLE_SWAGGER === 'true') {
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger')

    const config = new DocumentBuilder()
      .setTitle('Jagoo Bahee API')
      .setDescription('API documentation')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' }, 'JWT-auth')
      .build()

    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('api', app, document)
    expressApp.get('/swagger.json', (_req, res) => {
      res.json(document)
    })
  }
  await app.listen(process.env.PORT ?? 6000)
}

bootstrap()
