/**
 * The backend can consume `@jagoo/sdk`, and gets the SAME canonical bytes as everyone else.
 *
 * ── Why this is a permanent test and not a one-off check ─────────────────────────────
 * This was a real blocker: `backend/` used `moduleResolution: "Node"` (node10), which
 * ignores a package `exports` map outright, so `import ... from '@jagoo/sdk/core'` failed
 * at COMPILE time with TS2307 while the types sat right there on disk. Underneath that
 * was a second problem — the sdk is ESM, the backend is CommonJS.
 *
 * Both are fixed (backend on `node16`; the sdk ships a dual build). Neither fix is
 * self-announcing if it regresses: a future `tsconfig` tidy-up that resets
 * `moduleResolution`, or a build change that drops `dist/cjs`, would break P1 silently
 * rather than loudly. So the wiring is asserted, not assumed (build log L-11).
 *
 * ── Why `createRequire` and not just the static import ──────────────────────────────
 * Vitest runs through Vite, which resolves the `import` condition and would happily load
 * the ESM build — passing while the CommonJS path that NestJS actually uses at runtime is
 * broken. `createRequire` goes through Node's real resolver and picks the `require`
 * condition, so this exercises `dist/cjs` — the exact artefact `node dist/main.js` loads.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalBytes, contentIdFromCanonical, KeyAlg, Plane, Priority } from '@jagoo/sdk/core';
import type * as SdkCore from '@jagoo/sdk/core';

const REPO_ROOT = join(__dirname, '..', '..');

interface Expectation {
  readonly canonical_hex: string;
  readonly content_id: string;
}

/** The committed cross-language expectations — the same file Rust and Python assert on. */
const expected = JSON.parse(
  readFileSync(join(REPO_ROOT, 'tools', 'vectors', 'expected.json'), 'utf8'),
) as Record<string, Expectation>;

/** The `minimal` fixture: every zero-valued field omitted entirely (EN-01 rule 2). */
const MINIMAL = {
  version: 1,
  plane: Plane.FORUM,
  domain: 'jb:membership:leave:v1',
  author_key: new Uint8Array(0),
  key_alg: KeyAlg.ED25519,
  parent: '',
  scope: '',
  created_at_ms: 0n,
  nonce: new Uint8Array(0),
  priority: Priority.BULK,
  body: new Uint8Array(0),
};

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('@jagoo/sdk interop', () => {
  it('resolves via a static import and agrees with the cross-language expectation', () => {
    const canonical = canonicalBytes(MINIMAL);
    expect(hex(canonical)).toBe(expected['minimal']!.canonical_hex);
    expect(contentIdFromCanonical(canonical)).toBe(expected['minimal']!.content_id);
  });

  it('resolves via CommonJS require — the path NestJS actually uses at runtime', () => {
    const require_ = createRequire(join(REPO_ROOT, 'backend', 'package.json'));

    // Fails loudly if the `require` condition is missing, if dist/cjs was not built, or if
    // the `{"type":"commonjs"}` marker is absent (Node would then parse it as ESM and
    // throw "Unexpected token 'export'").
    const sdk = require_('@jagoo/sdk/core') as typeof SdkCore;

    const canonical = sdk.canonicalBytes(MINIMAL);
    expect(hex(canonical)).toBe(expected['minimal']!.canonical_hex);
    expect(sdk.contentIdFromCanonical(canonical)).toBe(expected['minimal']!.content_id);
  });

  it('the ESM and CommonJS builds produce identical bytes', () => {
    // A dual build is two compilations of one source. If they ever diverge, envelopes
    // signed by the backend would not verify against envelopes signed by the client.
    const require_ = createRequire(join(REPO_ROOT, 'backend', 'package.json'));
    const cjs = require_('@jagoo/sdk/core') as typeof SdkCore;

    expect(hex(cjs.canonicalBytes(MINIMAL))).toBe(hex(canonicalBytes(MINIMAL)));
  });
});
