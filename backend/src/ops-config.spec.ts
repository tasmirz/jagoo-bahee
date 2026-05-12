import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

describe('operations and federation test configuration', () => {
  const repoRoot = resolve(process.cwd(), '..')

  it('uses HAProxy for the horizontal scaling backend load balancer', () => {
    const compose = readFileSync(resolve(repoRoot, 'docker-compose.scale.yml'), 'utf8')
    const haproxyConfigPath = resolve(repoRoot, 'ops/haproxy/haproxy.cfg')
    const haproxy = readFileSync(haproxyConfigPath, 'utf8')

    expect(existsSync(haproxyConfigPath)).toBe(true)
    expect(compose).toContain('haproxy:2.9-alpine')
    expect(compose).toContain('./ops/haproxy/haproxy.cfg')
    expect(haproxy).toContain('server-template backend')
    expect(haproxy).toContain('GET /health/ready')
  })

  it('documents federation abuse scenarios as executable acceptance criteria', () => {
    const scenario = readFileSync(resolve(repoRoot, 'docs/FEDERATION_TEST_SCENARIO.md'), 'utf8')

    for (const requiredCase of [
      'Replay',
      'Forged signature',
      'Hash mismatch',
      'Unknown server',
      'SSRF discovery',
      'Oversized inbox',
      'Future timestamp',
      'Remote moderation'
    ]) {
      expect(scenario).toContain(requiredCase)
    }
  })
})
