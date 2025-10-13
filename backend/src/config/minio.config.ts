const rawEndpoint = process.env.MINIO_ENDPOINT || 'localhost:9000'
const useSsl = (process.env.MINIO_USE_SSL || 'false').toLowerCase() === 'true'
let endpoint = rawEndpoint
// ensure endpoint includes a scheme; AWS SDK expects a valid URI like http://host:port
if (!/^https?:\/\//i.test(rawEndpoint)) {
  endpoint = `${useSsl ? 'https' : 'http'}://${rawEndpoint}`
}

export const minioConfig = {
  endpoint,
  region: process.env.MINIO_REGION || 'us-east-1',
  accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  bucket: process.env.MINIO_BUCKET || 'uploads',
  useSsl,
  publicURL: process.env.MINIO_PUBLIC_URL || 'https://localhost:9000',
}

export default minioConfig
