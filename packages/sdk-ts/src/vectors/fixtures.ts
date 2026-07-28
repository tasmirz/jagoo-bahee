/**
 * Loader for the shared cross-language fixture set.
 *
 * The same `tools/vectors/fixtures/envelopes.json` is read by TypeScript, Rust and Python.
 * One file, three independent decoders — if a language disagrees about what the fixture
 * *means*, the gate catches it just as surely as if it disagreed about the encoding.
 *
 * `created_at_ms` is a decimal STRING in the fixture and becomes a `bigint` here. Parsing
 * it as a JSON number would round it through a double above 2^53, silently corrupting a
 * field that is inside the signature.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1–2
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hexToBytes } from '@noble/hashes/utils';
import type { Plane, KeyAlg, Priority, AntiAbuse, CanonicalEnvelope } from '../core/types.js';

/**
 * Walk up to the workspace root rather than counting `../` segments.
 *
 * A fixed relative path silently breaks when the output layout changes: this file runs
 * from `src/vectors/` under vitest and from `dist/esm/vectors/` after the dual build, which
 * are different depths. The first version hardcoded four levels, worked in both places by
 * coincidence, and started reading `packages/tools/vectors/...` the moment `dist/esm/` was
 * introduced. Anchoring on a marker file is depth-independent.
 */
export function workspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('workspace root not found: no pnpm-workspace.yaml above this file');
}

const FIXTURE_PATH = join(workspaceRoot(), 'tools', 'vectors', 'fixtures', 'envelopes.json');

interface AntiAbuseSpec {
  readonly credential?: string;
  readonly nullifier?: string;
  readonly epoch?: number;
  readonly pow?: string;
}

interface EnvelopeSpec {
  readonly version?: number;
  readonly plane?: number;
  readonly domain?: string;
  readonly author_key?: string;
  readonly key_alg?: number;
  readonly parent?: string;
  readonly scope?: string;
  readonly created_at_ms?: string;
  readonly nonce?: string;
  readonly priority?: number;
  readonly body?: string;
  readonly anti_abuse?: AntiAbuseSpec | null;
}

export interface Vector {
  readonly name: string;
  readonly description: string;
  readonly envelope: EnvelopeSpec;
}

interface FixtureFile {
  readonly vectors: readonly Vector[];
}

/** `""` must decode to an empty array, which `hexToBytes` handles, but be explicit. */
function bytes(hex: string | undefined): Uint8Array {
  return hex ? hexToBytes(hex) : new Uint8Array(0);
}

export function loadVectors(): readonly Vector[] {
  const parsed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureFile;
  return parsed.vectors;
}

/** Look one up by name — the regression specs address specific pairs. */
export function vector(name: string): Vector {
  const found = loadVectors().find((v) => v.name === name);
  if (!found) throw new Error(`fixture vector not found: ${name}`);
  return found;
}

export function envelopeFromFixture(spec: EnvelopeSpec): CanonicalEnvelope {
  const aa = spec.anti_abuse;
  const antiAbuse: AntiAbuse | undefined =
    aa == null
      ? undefined
      : {
          credential: bytes(aa.credential),
          nullifier: bytes(aa.nullifier),
          epoch: aa.epoch ?? 0,
          pow: bytes(aa.pow),
        };

  const env: CanonicalEnvelope = {
    version: spec.version ?? 0,
    plane: (spec.plane ?? 0) as Plane,
    domain: spec.domain ?? '',
    author_key: bytes(spec.author_key),
    key_alg: (spec.key_alg ?? 0) as KeyAlg,
    parent: spec.parent ?? '',
    scope: spec.scope ?? '',
    created_at_ms: BigInt(spec.created_at_ms ?? '0'),
    nonce: bytes(spec.nonce),
    priority: (spec.priority ?? 0) as Priority,
    body: bytes(spec.body),
    ...(antiAbuse ? { anti_abuse: antiAbuse } : {}),
  };
  return env;
}

/** The envelope for a named vector. */
export function envelope(name: string): CanonicalEnvelope {
  return envelopeFromFixture(vector(name).envelope);
}
