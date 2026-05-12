const defaultUri = (() => {
  // If a full connection string is provided, prefer it
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI

  // If docker-compose created root credentials are present in env, build a URI that uses them.
  const user = process.env.MONGO_INITDB_ROOT_USERNAME
  const pass = process.env.MONGO_INITDB_ROOT_PASSWORD
  const host = process.env.MONGODB_HOST ?? 'localhost'
  const port = process.env.MONGODB_PORT ?? '27018'
  const db = process.env.MONGODB_DATABASE ?? 'jagoo-bahee'

  if (user && pass) {
    // authSource=admin is commonly required for root user created by docker-entrypoint
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}?authSource=admin`
  }

  // Fallback to unauthenticated localhost
  return `mongodb://${host}:${port}/${db}`
})()

export const mongoConfig = { uri: defaultUri }

export default mongoConfig
