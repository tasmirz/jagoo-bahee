export const minioConfig = {
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'minio',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'miniopass',
  bucket: process.env.MINIO_BUCKET || 'attachments'
}

export default minioConfig
