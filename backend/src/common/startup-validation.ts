export function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return

  const missing: string[] = []
  if (!env.JWT_SECRET || env.JWT_SECRET === 'hard!to-guess_secret') missing.push('JWT_SECRET')
  if (!env.FRONTEND_ORIGIN) missing.push('FRONTEND_ORIGIN')
  if (!env.SERVER_PRIVATE_KEY_HEX || !/^[0-9a-fA-F]{64}$/.test(env.SERVER_PRIVATE_KEY_HEX)) missing.push('SERVER_PRIVATE_KEY_HEX')

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`)
  }
}
