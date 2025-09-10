import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // Enable automatic transformation and validation so DTO @Transform runs
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }))
  // Setup Swagger UI at /api
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger')

  const config = new DocumentBuilder()
    .setTitle('Jagoo Bahee API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document)
  await app.listen(process.env.PORT ?? 3000)
}

bootstrap()
