import fs from 'node:fs';
import path from 'node:path';

interface RegistryDomain {
  readonly domain: string;
  readonly plane: 'FORUM' | 'SIGNAL';
}

describe('signed command coverage', () => {
  it('keeps every registered domain inside the matching signer boundary', () => {
    const root = path.resolve(__dirname, '../../..');
    const registrySource = fs.readFileSync(
      path.join(root, 'proto/jagoo/v1/registry.yaml'),
      'utf8',
    );
    const domains: readonly RegistryDomain[] = [
      ...registrySource.matchAll(
        /^\s*-\s+domain:\s+'([^']+)'[\s\S]*?^\s+plane:\s+(FORUM|SIGNAL)\s*$/gm,
      ),
    ].map((match) => ({
      domain: match[1]!,
      plane: match[2]! as RegistryDomain['plane'],
    }));
    const forum = fs.readFileSync(path.join(root, 'frontend/src/signer/index.ts'), 'utf8');
    const signal = fs.readFileSync(path.join(root, 'frontend/src/signer/signal.ts'), 'utf8');

    // The registry grows as commands are added. This test protects signer-plane ownership,
    // not a historical command count.
    expect(domains.length).toBeGreaterThan(0);
    for (const entry of domains) {
      const expected = entry.plane === 'FORUM' ? forum : signal;
      const other = entry.plane === 'FORUM' ? signal : forum;
      expect(expected).toContain(`'${entry.domain}'`);
      expect(other).not.toContain(`'${entry.domain}'`);
    }
  });
});
