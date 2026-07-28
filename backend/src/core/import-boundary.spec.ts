/**
 * P0-G6 — the import-boundary lint FAILS when `core/domain` imports a driver.
 *
 * ── Why this test exists at all ──────────────────────────────────────────────────────
 * A lint rule that is configured but not exercised is a rule that silently stops working.
 * Rules get disabled by a config refactor, shadowed by a later flat-config block, or
 * scoped to a path that no longer matches after a directory move — and nothing fails,
 * because the codebase happens to be clean. The gate is not "the rule is in the config";
 * the gate is "a violation is rejected".
 *
 * So this writes a genuinely violating file into `core/domain/`, runs the real ESLint over
 * it, asserts a non-zero exit, and deletes it. It tests the rule, not a copy of the rule.
 */

import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DOMAIN_DIR = join(REPO_ROOT, 'backend', 'src', 'core', 'domain');
const ESLINT = join(REPO_ROOT, 'node_modules', '.bin', 'eslint');

const written: string[] = [];

function lintProbe(filename: string, source: string): { code: number; output: string } {
  const path = join(DOMAIN_DIR, filename);
  writeFileSync(path, source);
  written.push(path);

  try {
    const output = execFileSync(ESLINT, [path, '--no-warn-ignored'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

afterEach(() => {
  for (const path of written.splice(0)) rmSync(path, { force: true });
});

describe('import-boundary lint (P0-G6)', () => {
  it('rejects core/domain importing a database driver', () => {
    const { code, output } = lintProbe(
      '__probe_driver.ts',
      `import { MongoClient } from 'mongodb';\nexport const c = MongoClient;\n`,
    );
    expect(code, 'ESLint should have failed on a driver import').not.toBe(0);
    expect(output).toContain('AR-01');
  });

  it('rejects core/domain importing the framework', () => {
    const { code, output } = lintProbe(
      '__probe_nest.ts',
      `import { Injectable } from '@nestjs/common';\nexport const I = Injectable;\n`,
    );
    expect(code).not.toBe(0);
    expect(output).toContain('AR-01');
  });

  it('rejects core/domain importing an adapter', () => {
    const { code } = lintProbe(
      '__probe_adapter.ts',
      `import { InMemoryEnvelopeStore } from '../../adapters/outbound/in-memory/index.js';\n` +
        `export const S = InMemoryEnvelopeStore;\n`,
    );
    expect(code).not.toBe(0);
  });

  // AR-02: the pure layer must be deterministic given its inputs. Reading the clock or
  // the RNG directly is what makes a validation step untestable without fake timers.
  it('rejects a direct clock read in core/domain', () => {
    const { code, output } = lintProbe(
      '__probe_clock.ts',
      `export function now(): number { return Date.now(); }\n`,
    );
    expect(code).not.toBe(0);
    expect(output).toContain('AR-02');
  });

  it('rejects Math.random in core/domain', () => {
    const { code, output } = lintProbe(
      '__probe_random.ts',
      `export function r(): number { return Math.random(); }\n`,
    );
    expect(code).not.toBe(0);
    expect(output).toContain('AR-02');
  });

  // Regression for the clobbering bug specifically: `new Date()` is restricted by
  // `no-restricted-syntax` in the core/domain block, which an earlier config version had
  // overwritten with the core block's version of the same rule.
  it('rejects constructing a Date in core/domain', () => {
    const { code, output } = lintProbe(
      '__probe_newdate.ts',
      `export function stamp(): number { return new Date().getTime(); }\n`,
    );
    expect(code).not.toBe(0);
    expect(output).toContain('AR-02');
  });

  // AR-05: the registry dispatches. A domain switch means Open/Closed has failed.
  it('rejects a switch on domain inside the core', () => {
    const { code, output } = lintProbe(
      '__probe_switch.ts',
      `export function pick(domain: string): number {\n` +
        `  switch (domain) {\n` +
        `    case 'jb:post:create:v1': return 1;\n` +
        `    default: return 0;\n` +
        `  }\n}\n`,
    );
    expect(code).not.toBe(0);
    expect(output).toContain('AR-05');
  });

  // The control: a file that obeys every rule must pass, or the probes above would prove
  // nothing except that ESLint dislikes the directory.
  it('accepts a pure file with no forbidden imports', () => {
    const { code, output } = lintProbe(
      '__probe_clean.ts',
      `export function addOne(n: number): number { return n + 1; }\n`,
    );
    expect(code, `a clean file should lint cleanly, got:\n${output}`).toBe(0);
  });
});
