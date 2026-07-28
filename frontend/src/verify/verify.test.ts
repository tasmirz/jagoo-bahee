/**
 * The client computes the SAME content IDs as the backend, Rust and Python.
 *
 * This is the frontend half of the module-interop wiring (`backend/src/sdk-interop.spec.ts`
 * is the Node half). Both exist because the wiring failed silently once: Expo's base
 * tsconfig uses the legacy node10 resolver and Metro does not read package `exports` maps
 * by default, so `@jagoo/sdk/core` was unresolvable from `frontend/` even though the
 * package was correctly declared — a bare "Unable to resolve module" with no hint at the
 * cause (build log L-12).
 *
 * Asserting against the shared `expected.json` rather than against a locally-computed value
 * is the point: this fails if the client ever drifts from the canonical form the rest of
 * the network agreed on.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KeyAlg, Plane, Priority } from '@jagoo/sdk/core';
import { computeContentId, contentIdMatches } from './index';

const REPO_ROOT = join(__dirname, '..', '..', '..');

const expected = JSON.parse(
  readFileSync(join(REPO_ROOT, 'tools', 'vectors', 'expected.json'), 'utf8'),
) as Record<string, { canonical_hex: string; content_id: string }>;

/** The `minimal` fixture — every zero-valued field omitted entirely (EN-01 rule 2). */
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

describe('on-device verification', () => {
  it('computes the content ID the whole network agrees on', () => {
    expect(computeContentId(MINIMAL)).toBe(expected['minimal']!.content_id);
  });

  it('accepts a matching claimed content ID', () => {
    expect(contentIdMatches(MINIMAL, expected['minimal']!.content_id)).toBe(true);
  });

  it('rejects a claimed content ID that does not match the envelope', () => {
    // The attack it guards: a relay hands over content under someone else's ID.
    expect(contentIdMatches(MINIMAL, 'jb1' + 'a'.repeat(52))).toBe(false);
  });

  it('rejects a content ID lifted from a different envelope', () => {
    expect(contentIdMatches(MINIMAL, expected['forum-post-full']!.content_id)).toBe(false);
  });
});
