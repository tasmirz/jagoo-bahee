#!/usr/bin/env node
/**
 * Deterministic cross-language PBT + differential fuzzing gate (R1.7, D3).
 *
 * Exercises TypeScript (@jagoo/sdk), Rust (jb-core jb-fuzz), and Python (tools/vectors/fuzz.py)
 * on:
 *   - 10,000 randomized + boundary-value valid envelopes (encode + decode round-trip)
 *   - 10,000 malformed / adversarial / bit-flipped / random wire-byte inputs (decode)
 *
 * Writes summary metrics to ops/results/reviewer-experiments/02-differential-fuzz.json.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ByteWriter,
  FIELD,
  canonicalBytes,
  contentIdFromCanonical,
  decodeSignedEnvelope,
  encodeSignedEnvelope,
} from '../../packages/sdk-ts/dist/esm/core/index.js';
import {
  writeLengthDelimited,
  writeVarintField,
} from '../../packages/sdk-ts/dist/esm/core/wire.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SEED = 20260831;
const VALID_COUNT = 10_000;
const MALFORMED_COUNT = 10_000;

function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, maxInclusive) {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

function randBytes(rng, len) {
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) buf[i] = randInt(rng, 0, 255);
  return buf;
}

const toHex = (u8) => Buffer.from(u8).toString('hex');
const fromHex = (s) => Uint8Array.from(Buffer.from(s, 'hex'));

const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'tools', 'vectors', 'fixtures', 'envelopes.json'), 'utf8'));
const DOMAINS = [
  'jb:post:create:v1',
  'jb:comment:create:v1',
  'jb:vote:cast:v1',
  'jb:broadcast:emit:v1',
  'jb:checkin:post:v1',
  'jb:community:create:v1',
  'jb:key:certify:forum:v1',
  'jb:membership:leave:v1',
  'jb:message:forum:v1',
  '',
];
const UNICODE_POOL = [
  '',
  'dhaka-relief@jbs1a4f7m2k',
  'café@jbs1a4f7m2k',
  'cafe\u0301@jbs1a4f7m2k',
  'পানি বাড়ছে, এখনই সরে যান',
  'ড়ঢ়য়', // composed Bangla nukta exclusions (decomposed by NFC!)
  'ড়ঢ়য়', // decomposed Bangla nukta pairs
  'a\u0300b\u0301c\u0327',
  'x'.repeat(64),
];
const CREATED_AT_BOUNDARIES = [
  '0',
  '1',
  '127',
  '128',
  '16383',
  '16384',
  '2147483647',
  '9007199254740991',
  '9007199254740992',
  '9007199254740993',
  '4611686018427387904',
  '9223372036854775807',
  '-1',
  '-9223372036854775808',
  '1750000000000',
];
const VERSION_BOUNDARIES = [0, 1, 2, 127, 128, 65535, 2147483647, 4294967295];

function generateValidCases(rng, count) {
  const cases = [];
  const categories = { boundary: 0, unicode_nfc: 0, random_full: 0, empty_aa_variants: 0 };

  for (let i = 0; i < count; i += 1) {
    const mode = i % 10;
    let category;
    let version = 1;
    let plane = randInt(rng, 0, 2);
    let domain = pick(rng, DOMAINS);
    let authorKey = rng() < 0.15 ? new Uint8Array(0) : randBytes(rng, 32);
    let keyAlg = pick(rng, [0, 1, 2, 3]);
    let parent = rng() < 0.5 ? '' : `jb1${toHex(randBytes(rng, 10))}`;
    let scope = pick(rng, UNICODE_POOL);
    let createdAtMs;
    let nonce = rng() < 0.2 ? new Uint8Array(0) : randBytes(rng, pick(rng, [4, 16, 32]));
    let priority = randInt(rng, 0, 4);
    let bodyLen = mode === 0 ? pick(rng, [0, 1, 127, 128, 512, 1024, 4096]) : randInt(rng, 0, 512);
    let body = randBytes(rng, bodyLen);
    let antiAbuse = null;
    let sig = rng() < 0.2 ? new Uint8Array(0) : randBytes(rng, 64);

    if (mode === 0 || mode === 1) {
      category = 'boundary';
      version = pick(rng, VERSION_BOUNDARIES);
      createdAtMs = pick(rng, CREATED_AT_BOUNDARIES);
    } else if (mode === 2 || mode === 3) {
      category = 'unicode_nfc';
      domain = pick(rng, ['jb:post:create:v1', 'café', 'cafe\u0301', 'ড়ঢ়য়', 'ড়ঢ়য়']);
      parent = pick(rng, ['', 'café', 'cafe\u0301', 'পানি বাড়ছে']);
      scope = pick(rng, ['café@jbs1', 'cafe\u0301@jbs1', 'ড়', 'ড়', 'ঢ়', 'য়']);
      createdAtMs = String(randInt(rng, 1, 2_000_000_000) * 1000);
    } else if (mode === 4) {
      category = 'empty_aa_variants';
      antiAbuse = rng() < 0.5 ? null : { credential: '', nullifier: '', epoch: 0, pow: '' };
      createdAtMs = String(randInt(rng, 0, 1_900_000_000_000));
    } else {
      category = 'random_full';
      createdAtMs = String(BigInt(randInt(rng, 0, 2_000_000_000)) * 1_000_000n + BigInt(randInt(rng, 0, 999_999)));
      if (rng() < 0.6) {
        antiAbuse = {
          credential: rng() < 0.5 ? '' : toHex(randBytes(rng, randInt(rng, 1, 48))),
          nullifier: rng() < 0.5 ? '' : toHex(randBytes(rng, randInt(rng, 1, 32))),
          epoch: rng() < 0.4 ? 0 : pick(rng, [1, 42, 65535, 0xffffffff]),
          pow: rng() < 0.5 ? '' : toHex(randBytes(rng, pick(rng, [0, 4, 73]))),
        };
      }
    }

    categories[category] += 1;
    cases.push({
      category,
      envelope: {
        version,
        plane,
        domain,
        author_key: toHex(authorKey),
        key_alg: keyAlg,
        parent,
        scope,
        created_at_ms: createdAtMs,
        nonce: toHex(nonce),
        priority,
        body: toHex(body),
        anti_abuse: antiAbuse,
      },
      signature: toHex(sig),
    });
  }
  return { cases, categories };
}

function generateMalformedCases(rng, validWireHexes, count) {
  const cases = [];
  const kinds = [
    'descending_fields',
    'repeated_field',
    'explicit_zero_varint',
    'explicit_empty_bytes',
    'empty_anti_abuse',
    'unknown_env_field',
    'unknown_aa_field',
    'unsupported_wire_type',
    'overlong_varint',
    'truncated_varint',
    'length_past_buffer',
    'invalid_utf8',
    'non_nfc_string',
    'trailing_bytes',
    'bit_flip_valid',
    'random_bytes',
  ];
  const counts = Object.fromEntries(kinds.map((k) => [k, 0]));

  for (let i = 0; i < count; i += 1) {
    const kind = kinds[i % kinds.length];
    counts[kind] += 1;
    let raw;

    switch (kind) {
      case 'descending_fields': {
        const w = new ByteWriter(64);
        const f1 = randInt(rng, 2, 12);
        const f2 = randInt(rng, 1, f1 - 1);
        writeVarintField(w, f1, 1n);
        writeVarintField(w, f2, 1n);
        raw = w.finish();
        break;
      }
      case 'repeated_field': {
        const w = new ByteWriter(64);
        const f = pick(rng, [1, 2, 5, 10]);
        writeVarintField(w, f, 1n);
        writeVarintField(w, f, 2n);
        raw = w.finish();
        break;
      }
      case 'explicit_zero_varint': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        writeVarintField(w, pick(rng, [FIELD.PLANE, FIELD.KEY_ALG, FIELD.CREATED_AT_MS, FIELD.PRIORITY]), 0n);
        raw = w.finish();
        break;
      }
      case 'explicit_empty_bytes': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        writeLengthDelimited(
          w,
          pick(rng, [FIELD.DOMAIN, FIELD.AUTHOR_KEY, FIELD.PARENT, FIELD.SCOPE, FIELD.NONCE, FIELD.BODY, FIELD.SIGNATURE]),
          new Uint8Array(0),
        );
        raw = w.finish();
        break;
      }
      case 'empty_anti_abuse': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        if (rng() < 0.5) {
          writeLengthDelimited(w, FIELD.ANTI_ABUSE, new Uint8Array(0));
        } else {
          const inner = new ByteWriter(16);
          writeVarintField(inner, 3, 0n);
          writeLengthDelimited(w, FIELD.ANTI_ABUSE, inner.finish());
        }
        raw = w.finish();
        break;
      }
      case 'unknown_env_field': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        writeVarintField(w, randInt(rng, 14, 500), BigInt(randInt(rng, 1, 200)));
        raw = w.finish();
        break;
      }
      case 'unknown_aa_field': {
        const inner = new ByteWriter(16);
        writeVarintField(inner, randInt(rng, 5, 50), 1n);
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        writeLengthDelimited(w, FIELD.ANTI_ABUSE, inner.finish());
        raw = w.finish();
        break;
      }
      case 'unsupported_wire_type': {
        const w = new ByteWriter(32);
        const f = randInt(rng, 1, 13);
        const wt = pick(rng, [1, 3, 4, 5, 6, 7]);
        w.tag(f, wt);
        w.bytes(randBytes(rng, wt === 1 ? 8 : 4));
        raw = w.finish();
        break;
      }
      case 'overlong_varint': {
        const w = new ByteWriter(32);
        w.tag(FIELD.VERSION, 0);
        const conts = randInt(rng, 10, 14);
        for (let j = 0; j < conts; j += 1) w.byte(0x80 | randInt(rng, 0, 127));
        w.byte(0x01);
        raw = w.finish();
        break;
      }
      case 'truncated_varint': {
        const w = new ByteWriter(16);
        w.tag(FIELD.VERSION, 0);
        const conts = randInt(rng, 1, 5);
        for (let j = 0; j < conts; j += 1) w.byte(0x80 | randInt(rng, 0, 127));
        raw = w.finish();
        break;
      }
      case 'length_past_buffer': {
        const w = new ByteWriter(32);
        w.tag(FIELD.BODY, 2);
        const payload = randBytes(rng, randInt(rng, 1, 12));
        w.varint(BigInt(payload.length + randInt(rng, 1, 50)));
        w.bytes(payload);
        raw = w.finish();
        break;
      }
      case 'invalid_utf8': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        const bad = pick(rng, [
          new Uint8Array([0xff, 0xfe]),
          new Uint8Array([0xc3, 0x28]),
          new Uint8Array([0xe2, 0x82, 0x28]),
          new Uint8Array([0xf0, 0x28, 0x8c, 0xbc]),
        ]);
        writeLengthDelimited(w, pick(rng, [FIELD.DOMAIN, FIELD.PARENT, FIELD.SCOPE]), bad);
        raw = w.finish();
        break;
      }
      case 'non_nfc_string': {
        const w = new ByteWriter(64);
        writeVarintField(w, FIELD.VERSION, 1n);
        const nfd = pick(rng, ['cafe\u0301', 'a\u0300', '\u09DC', '\u09DD', '\u09DF']);
        writeLengthDelimited(w, pick(rng, [FIELD.DOMAIN, FIELD.PARENT, FIELD.SCOPE]), new TextEncoder().encode(nfd));
        raw = w.finish();
        break;
      }
      case 'trailing_bytes': {
        const base = fromHex(pick(rng, validWireHexes));
        const extra = randBytes(rng, randInt(rng, 1, 8));
        raw = new Uint8Array(base.length + extra.length);
        raw.set(base);
        raw.set(extra, base.length);
        break;
      }
      case 'bit_flip_valid': {
        const base = Uint8Array.from(fromHex(pick(rng, validWireHexes)));
        const flips = randInt(rng, 1, 3);
        for (let k = 0; k < flips; k += 1) {
          const idx = randInt(rng, 0, Math.max(0, base.length - 1));
          if (base.length > 0) base[idx] ^= 1 << randInt(rng, 0, 7);
        }
        raw = base;
        break;
      }
      default: {
        raw = randBytes(rng, randInt(rng, 1, 128));
        break;
      }
    }

    cases.push({ kind, wire_hex: toHex(raw) });
  }
  return { cases, counts };
}

function runTsTasks(tasks) {
  return tasks.map((task) => {
    if (task.op === 'encode') {
      const e = task.envelope;
      const env = {
        version: e.version,
        plane: e.plane,
        domain: e.domain,
        author_key: fromHex(e.author_key),
        key_alg: e.key_alg,
        parent: e.parent,
        scope: e.scope,
        created_at_ms: BigInt(e.created_at_ms),
        nonce: fromHex(e.nonce),
        priority: e.priority,
        body: fromHex(e.body),
        ...(e.anti_abuse
          ? {
              anti_abuse: {
                credential: fromHex(e.anti_abuse.credential),
                nullifier: fromHex(e.anti_abuse.nullifier),
                epoch: e.anti_abuse.epoch,
                pow: fromHex(e.anti_abuse.pow),
              },
            }
          : {}),
        signature: fromHex(task.signature),
      };
      const canonical = canonicalBytes(env);
      const wire = encodeSignedEnvelope(env);
      return {
        ok: true,
        canonical_hex: toHex(canonical),
        wire_hex: toHex(wire),
        content_id: contentIdFromCanonical(canonical),
      };
    }
    try {
      const decoded = decodeSignedEnvelope(fromHex(task.wire_hex));
      const canonical = canonicalBytes(decoded);
      const wire = encodeSignedEnvelope(decoded);
      return {
        ok: true,
        canonical_hex: toHex(canonical),
        wire_hex: toHex(wire),
        content_id: contentIdFromCanonical(canonical),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function runWorker(cmd, args, tasks) {
  const input = tasks.map((t) => JSON.stringify(t)).join('\n') + '\n';
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (${res.status}):\n${res.stderr}`);
  }
  return res.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function findRustFuzzBinary() {
  const meta = JSON.parse(
    execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
      cwd: ROOT,
      encoding: 'utf8',
    }),
  );
  const bin = join(meta.target_directory, 'release', 'jb-fuzz');
  if (!existsSync(bin)) {
    execFileSync('cargo', ['build', '--release', '-p', 'jb-core', '--bin', 'jb-fuzz'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
  return bin;
}

function compareResults(label, tasks, tsRes, rustRes, pyRes) {
  if (tsRes.length !== tasks.length || rustRes.length !== tasks.length || pyRes.length !== tasks.length) {
    throw new Error(`${label}: result length mismatch`);
  }
  let accepted = 0;
  let rejected = 0;
  const disagreements = [];

  for (let i = 0; i < tasks.length; i += 1) {
    const a = tsRes[i];
    const b = rustRes[i];
    const c = pyRes[i];

    if (a.ok !== b.ok || a.ok !== c.ok) {
      disagreements.push({ index: i, task: tasks[i], ts: a, rust: b, python: c });
      continue;
    }
    if (a.ok) {
      accepted += 1;
      if (
        a.canonical_hex !== b.canonical_hex ||
        a.canonical_hex !== c.canonical_hex ||
        a.wire_hex !== b.wire_hex ||
        a.wire_hex !== c.wire_hex ||
        a.content_id !== b.content_id ||
        a.content_id !== c.content_id
      ) {
        disagreements.push({ index: i, task: tasks[i], ts: a, rust: b, python: c });
      }
    } else {
      rejected += 1;
    }
  }
  return { total: tasks.length, accepted, rejected, disagreements };
}

function main() {
  const t0 = Date.now();
  const rng = makeRng(SEED);
  const rustBin = findRustFuzzBinary();

  const valid = generateValidCases(rng, VALID_COUNT);
  const encodeTasks = valid.cases.map((c) => ({ op: 'encode', envelope: c.envelope, signature: c.signature }));

  const encTs = runTsTasks(encodeTasks);
  const encRust = runWorker(rustBin, [], encodeTasks);
  const encPy = runWorker('python3', [join(HERE, 'fuzz.py')], encodeTasks);
  const encodeSummary = compareResults('valid-encode', encodeTasks, encTs, encRust, encPy);

  const validWireHexes = encTs.map((r) => r.wire_hex);
  const roundTripTasks = validWireHexes.map((wire_hex) => ({ op: 'decode', wire_hex }));
  const rtTs = runTsTasks(roundTripTasks);
  const rtRust = runWorker(rustBin, [], roundTripTasks);
  const rtPy = runWorker('python3', [join(HERE, 'fuzz.py')], roundTripTasks);
  const roundTripSummary = compareResults('valid-roundtrip-decode', roundTripTasks, rtTs, rtRust, rtPy);

  const malformed = generateMalformedCases(rng, validWireHexes.slice(0, 500), MALFORMED_COUNT);
  const malTasks = malformed.cases.map((c) => ({ op: 'decode', wire_hex: c.wire_hex }));
  const malTs = runTsTasks(malTasks);
  const malRust = runWorker(rustBin, [], malTasks);
  const malPy = runWorker('python3', [join(HERE, 'fuzz.py')], malTasks);
  const malSummary = compareResults('malformed-decode', malTasks, malTs, malRust, malPy);

  const totalDisagreements =
    encodeSummary.disagreements.length +
    roundTripSummary.disagreements.length +
    malSummary.disagreements.length;

  const report = {
    recordedAt: new Date().toISOString(),
    seed: SEED,
    elapsedMs: Date.now() - t0,
    implementations: ['typescript', 'rust', 'python'],
    fixtureCount: REGISTRY.vectors.length,
    validCorpus: {
      total: VALID_COUNT,
      categories: valid.categories,
      encode: {
        accepted: encodeSummary.accepted,
        disagreements: encodeSummary.disagreements.length,
      },
      roundTripDecode: {
        accepted: roundTripSummary.accepted,
        disagreements: roundTripSummary.disagreements.length,
      },
    },
    malformedCorpus: {
      total: MALFORMED_COUNT,
      categories: malformed.counts,
      rejected: malSummary.rejected,
      acceptedByAllThree: malSummary.accepted,
      disagreements: malSummary.disagreements.length,
    },
    sampleDisagreements: [
      ...encodeSummary.disagreements.slice(0, 5),
      ...roundTripSummary.disagreements.slice(0, 5),
      ...malSummary.disagreements.slice(0, 5),
    ],
    totalDisagreements,
  };

  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '02-differential-fuzz.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (totalDisagreements > 0) {
    process.stderr.write(`FAILED: ${totalDisagreements} cross-language disagreement(s)\n`);
    process.exit(1);
  }
}

main();
