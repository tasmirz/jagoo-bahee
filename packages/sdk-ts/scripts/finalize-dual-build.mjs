#!/usr/bin/env node
/**
 * Writes the `type` markers that make the dual build actually load.
 *
 * This package declares `"type": "module"` at its root, so Node treats EVERY `.js` file
 * beneath it as ESM — including the CommonJS output in `dist/cjs/`, which would then fail
 * at require time with `SyntaxError: Unexpected token 'export'`. A nested package.json
 * overrides the format for its subtree, which is the supported way to ship both.
 *
 * Without this file the CJS build compiles cleanly and breaks only when something requires
 * it, which is the worst possible time to find out.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const markers = [
  ['dist/cjs', 'commonjs'],
  ['dist/esm', 'module'],
];

for (const [dir, type] of markers) {
  const abs = join(PKG_ROOT, dir);
  if (!existsSync(abs)) {
    throw new Error(`${dir} missing — did tsc run? Expected output at ${abs}`);
  }
  writeFileSync(join(abs, 'package.json'), `${JSON.stringify({ type }, null, 2)}\n`);
}

process.stderr.write('  dual build finalised: dist/cjs (commonjs) + dist/esm (module)\n');
