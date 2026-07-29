import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const CRYPTO_DIR = join(REPO_ROOT, 'packages', 'sdk-ts', 'src', 'crypto');
const ESLINT_ENTRY = join(REPO_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');
const probe = join(CRYPTO_DIR, '__probe_direct_crypto.ts');

afterEach(() => rmSync(probe, { force: true }));

describe('CryptoBackend import boundary (CRYPTO-01)', () => {
  it('makes a direct production primitive import fail on purpose', () => {
    writeFileSync(
      probe,
      "import { sha256 } from '@noble/hashes/sha2';\nexport const digest = sha256;\n",
    );

    let code = 0;
    let output = '';
    try {
      output = execFileSync(
        process.execPath,
        [ESLINT_ENTRY, probe, '--no-warn-ignored'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      code = failure.status ?? -1;
      output = `${failure.stdout ?? ''}${failure.stderr ?? ''}`;
    }

    expect(code, output).toBeGreaterThan(0);
    expect(output).toContain('CRYPTO-01');
  });
});
