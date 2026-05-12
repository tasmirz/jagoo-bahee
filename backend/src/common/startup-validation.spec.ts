import { validateProductionConfig } from './startup-validation'

describe('validateProductionConfig', () => {
  it('allows non-production defaults for local development and tests', () => {
    expect(() => validateProductionConfig({ NODE_ENV: 'test' } as any)).not.toThrow()
  })

  it('fails production boot when critical security env vars are missing', () => {
    expect(() => validateProductionConfig({ NODE_ENV: 'production' } as any)).toThrow(
      'Missing required production environment variables: JWT_SECRET, FRONTEND_ORIGIN, SERVER_PRIVATE_KEY_HEX'
    )
  })

  it('accepts production boot with explicit stable secrets and CORS origin', () => {
    expect(() =>
      validateProductionConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'explicit-secret',
        FRONTEND_ORIGIN: 'https://example.com',
        SERVER_PRIVATE_KEY_HEX: '1'.repeat(64)
      } as any)
    ).not.toThrow()
  })
})
