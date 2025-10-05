import { jwtConfig } from './jwt.config'
import mongoConfig from './mongo.config'
import minioConfig from './minio.config'
import attachmentsConfig from './attachments.config'
import appConfig from './app.config'

const config = {
  jwt: jwtConfig,
  mongo: mongoConfig,
  minio: minioConfig,
  attachments: attachmentsConfig,
  app: appConfig
}

export default config
