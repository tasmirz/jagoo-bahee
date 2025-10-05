import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { writeFileSync } from 'fs'

async function generate() {
  // Create a temporary Nest application context (no listener)
  const app = await NestFactory.create(AppModule, { logger: false })

  // Build Swagger document (match main.ts configuration)
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger')

  const config = new DocumentBuilder()
    .setTitle('Jagoo Bahee API')
    .setDescription('API documentation')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' }, 'JWT-auth')
    .build()

  const document = SwaggerModule.createDocument(app, config)

  // Write swagger.json to project root
  const outPath = 'swagger.json'
  writeFileSync(outPath, JSON.stringify(document, null, 2), { encoding: 'utf8' })
  console.log(`Wrote OpenAPI JSON to ${outPath}`)

  await app.close()
}

generate().catch(err => {
  console.error('Failed to generate Swagger document:', err)
  process.exit(1)
})
