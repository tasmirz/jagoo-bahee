/**
 * Emit this implementation's canonical output for every fixture, as JSON on stdout.
 *
 * The gate runner (`tools/vectors/run-gate.mjs`) collects one of these per language and
 * compares them pairwise. Nothing here asserts — asserting is the runner's job, and
 * keeping the dump dumb means a language cannot accidentally pass itself.
 *
 *     node packages/sdk-ts/dist/vectors/dump.js
 */

import { bytesToHex } from '@noble/hashes/utils';
import { canonicalBytes } from '../core/canonical.js';
import { contentIdFromCanonical } from '../core/content-id.js';
import { envelopeFromFixture, loadVectors } from './fixtures.js';

function main(): void {
  const out: Record<string, { canonical_hex: string; content_id: string }> = {};

  for (const v of loadVectors()) {
    const canonical = canonicalBytes(envelopeFromFixture(v.envelope));
    out[v.name] = {
      canonical_hex: bytesToHex(canonical),
      content_id: contentIdFromCanonical(canonical),
    };
  }

  // Sorted keys so the runner's diff stays readable and stable.
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  process.stdout.write(`${JSON.stringify(sorted, null, 2)}\n`);
}

main();
