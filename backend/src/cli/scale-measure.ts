/**
 * Multi-hop federation propagation latency, measured from projection timestamps.
 *
 *   pnpm scale:measure                       # 8 nodes, 200 samples
 *   pnpm scale:measure -- --nodes=8 --samples=200
 *
 * ── Why not a poller ────────────────────────────────────────────────────────────────
 * The first propagation figure this project ever had — "623–857 ms" — was produced by
 * publishing on A and polling B over HTTP until the projection appeared. That is an UPPER
 * BOUND and nothing more: it charges the measurement for a poll interval plus a request
 * round trip, and it cannot distinguish a node that projected instantly from one that
 * projected just after the previous poll returned.
 *
 * Every node already records `envelopes.received_at_ms` at the moment it stores an envelope,
 * inside the same transaction as the projection and the witness append. So the latency of a
 * hop is a subtraction between two numbers the system wrote down for its own reasons, and no
 * observer sits in the path at all.
 *
 * ── The clock assumption, stated because it is load-bearing ─────────────────────────
 * `received_at_ms` is each node's own wall clock. Subtracting across nodes is only valid
 * because every container here shares the host's clock, so skew is zero by construction. A
 * geographically distributed deployment would need NTP discipline and an error bar, or a
 * one-way-delay estimator. This is a property of the harness, not of the system, and any
 * figure derived from it must carry the caveat.
 *
 * ── What varies, and what is held fixed ─────────────────────────────────────────────
 * The chain topology makes hop count the only independent variable: `jb-n<i>` is reachable
 * from `jb-n0` by exactly one path of exactly `i` hops. Held fixed: one publisher, one
 * community, one priority class (BULK), and the drain interval, which is the dominant term
 * and is reported with the result rather than left implicit.
 */

import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import argon2 from 'argon2';
import {
  Plane,
  blindCredential,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  pqAttestationBytes,
  sealEnvelope,
  unblindCredential,
} from '@jagoo/sdk';
import { ed25519, mldsa } from '@jagoo/sdk/crypto';
import type { BlindCredentialPublicKey } from '@jagoo/sdk/signer';
import { CommunityCreate, KeyCertificate, PostCreate, PostKind } from '@jagoo/sdk/proto';

const exec = promisify(execFile);
const text = new TextEncoder();
const base64 = (value: Uint8Array): string => Buffer.from(value).toString('base64');
const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'));
const digest = (value: string): Uint8Array =>
  new Uint8Array(createHash('sha256').update(value, 'utf8').digest());

function arg(name: string, fallback: number): number {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? Number(hit.slice(name.length + 3)) : fallback;
}

const NODES = arg('nodes', 8);
const SAMPLES = arg('samples', 200);
const BASE_PORT = arg('base', 3200);
const MONGO_CONTAINER = 'jb-scale-mongo';
const SETTLE_TIMEOUT_MS = arg('settle', 180_000);

/**
 * Milliseconds between publications. **This is the difference between two experiments.**
 *
 * At `--pace=0` the harness publishes as fast as the origin will accept, which on this
 * hardware is ~6 envelopes/second — faster than the outbox drains. The queue then grows for
 * the length of the run and the first hop absorbs all of it: a 200-sample burst measured
 * p50 10.0 s and p95 173 s at hop 1, while the MARGINAL cost of hops 2–7 stayed at
 * 0.4–1.1 s. That is not propagation latency, it is the origin's send queue, and reporting
 * it as latency would be wrong in the most flattering-to-nobody direction.
 *
 * Pacing above the service rate measures the unloaded path: what one envelope costs per hop
 * when it is not standing behind others. Both regimes are worth reporting, but they are
 * different quantities and must not be averaged together.
 */
const PACE_MS = arg('pace', 0);

function workspaceRoot(): string {
  // `__dirname`, not `import.meta.url`: this package compiles to CommonJS.
  let dir = __dirname;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not locate pnpm-workspace.yaml above this file');
}

const urlFor = (i: number): string => `http://127.0.0.1:${BASE_PORT + i}`;

async function json<T>(url: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(new URL(path, `${url.replace(/\/+$/, '')}/`), {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json()) as T & { detail?: string };
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} — ${payload.detail ?? `HTTP ${response.status}`}`);
  }
  return payload;
}

function envelopeBytes(
  seed: Uint8Array,
  domain: string,
  body: Uint8Array,
  antiAbuse?: {
    readonly credential: Uint8Array;
    readonly nullifier: Uint8Array;
    readonly epoch: number;
    readonly pow: Uint8Array;
  },
  scope = '',
): Uint8Array {
  const unsigned = buildEnvelope({
    domain,
    plane: Plane.FORUM,
    authorKey: ed25519.derivePublicKey(seed),
    body,
    nowMs: BigInt(Date.now()),
    nonce: new Uint8Array(randomBytes(16)),
    antiAbuse,
    scope,
  });
  return sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed)).wireBytes;
}

interface PowChallenge {
  readonly challenge: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly expiresAtMs: number;
}

async function solvePow(challenge: PowChallenge, authorKey: Uint8Array): Promise<Uint8Array> {
  const challengeBytes = fromBase64(challenge.challenge);
  const hashed = await argon2.hash(Buffer.from(challengeBytes).toString('hex'), {
    type: argon2.argon2id,
    salt: Buffer.from(authorKey),
    memoryCost: Math.max(1024, challenge.memoryKiB),
    timeCost: Math.max(2, challenge.iterations),
    parallelism: challenge.parallelism,
    hashLength: 32,
    raw: true,
  });
  const proof = new Uint8Array(73);
  proof[0] = 1;
  new DataView(proof.buffer).setBigUint64(1, BigInt(challenge.expiresAtMs), false);
  proof.set(challengeBytes, 9);
  proof.set(hashed, 41);
  return proof;
}

/**
 * Everything expensive, done once.
 *
 * Proof of work, the certificate, the session and the blind credential are all per-IDENTITY
 * costs, and paying them inside the sample loop would measure Argon2 rather than the network.
 * Only the nullifier varies per sample, which is the one thing that MUST vary: it is spent on
 * use, and reusing one is anti-abuse working correctly against a tool asking twice.
 */
async function setup(url: string): Promise<{
  seed: Uint8Array;
  credential: Uint8Array;
  epoch: number;
  salt: string;
  communityId: string;
  token: string;
}> {
  const identity = `jb-scale-${Date.now()}`;
  const seed = digest(identity);
  const publicKey = ed25519.derivePublicKey(seed);
  const validFrom = BigInt(Date.now() - 60_000);
  const validUntil = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pq = mldsa.generateKeyPair(digest(`${identity}-pq`));
  const fields = { plane: Plane.FORUM, deviceKey: publicKey, pqKey: pq.publicKey, validFrom, validUntil };
  const attestation = mldsa.attest(pqAttestationBytes(fields), pq.secretKey);
  pq.secretKey.fill(0);
  const certificate = KeyCertificate.encode(
    KeyCertificate.fromPartial({
      plane: 1,
      device_key: publicKey,
      pq_key: pq.publicKey,
      pq_attestation: attestation,
      valid_from: validFrom,
      valid_until: validUntil,
      self_signature: ed25519.sign(certificateSelfSignatureBytes(fields, attestation), seed),
    }),
  ).finish();

  const challenge = await json<PowChallenge>(url, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(publicKey) }),
  });
  const pow = await solvePow(challenge, publicKey);
  await json(url, '/v1/envelopes', {
    method: 'POST',
    body: JSON.stringify({
      envelope: base64(
        envelopeBytes(seed, 'jb:key:certify:forum:v1', certificate, {
          credential: new Uint8Array(0),
          nullifier: new Uint8Array(0),
          epoch: 0,
          pow,
        }),
      ),
    }),
  });

  const challenged = await json<{ challenge: string; claim: string }>(
    url,
    `/v1/auth/challenge?public_key=${encodeURIComponent(base64(publicKey))}`,
  );
  const authBytes = new Uint8Array([
    ...text.encode('jb-auth-v1\0login\0'),
    ...publicKey,
    ...fromBase64(challenged.challenge),
  ]);
  const session = await json<{ accessToken: string }>(url, '/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: base64(publicKey),
      challenge: challenged.challenge,
      claim: challenged.claim,
      signature: base64(ed25519.sign(authBytes, seed)),
    }),
  });

  const parameters = await json<BlindCredentialPublicKey>(url, '/v1/credentials/parameters');
  const blinded = blindCredential(
    parameters,
    new Uint8Array(randomBytes(32)),
    new Uint8Array(randomBytes(parameters.width)),
  );
  const issued = await json<{ blindSignature: string }>(url, '/v1/credentials/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ blinded: base64(blinded.blinded) }),
  });
  const credential = unblindCredential(blinded.state, fromBase64(issued.blindSignature));
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const salt = identity;
  const communityName = `scale_${String(Date.now()).slice(-8)}`;

  await json(url, '/v1/envelopes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      envelope: base64(
        envelopeBytes(
          seed,
          'jb:community:create:v1',
          CommunityCreate.encode(
            CommunityCreate.fromPartial({
              name: communityName,
              title: 'Scale harness',
              description: 'Propagation latency measurement.',
            }),
          ).finish(),
          { credential, nullifier: digest(`jb:community:create:v1\0${epoch}\0${salt}`), epoch, pow },
        ),
      ),
    }),
  });
  const listed = await json<{ readonly items: readonly { id: string; name: string }[] }>(
    url,
    `/v1/communities?q=${encodeURIComponent(communityName)}`,
  );
  const communityId = listed.items.find((item) => item.name === communityName)?.id;
  if (!communityId) throw new Error('scale community was not projected');
  return { seed, credential, epoch, salt, communityId, token: session.accessToken };
}

interface Row {
  readonly node: number;
  readonly id: string;
  readonly receivedAtMs: number;
}

/** One query across every node database — they share a mongod, so this is a single round trip. */
async function collect(): Promise<readonly Row[]> {
  const script = `
    const out = [];
    for (let i = 0; i < ${NODES}; i++) {
      const d = db.getSiblingDB('jagoo_n' + i);
      d.envelopes.find({}, { received_at_ms: 1 }).forEach(function (doc) {
        out.push({ node: i, id: doc._id, t: doc.received_at_ms });
      });
    }
    print(JSON.stringify(out));
  `;
  const { stdout } = await exec(
    'docker',
    ['exec', MONGO_CONTAINER, 'mongosh', '--quiet', '--eval', script],
    { maxBuffer: 1 << 28 },
  );
  const parsed = JSON.parse(stdout.trim()) as { node: number; id: string; t: number }[];
  return parsed.map((row) => ({ node: row.node, id: row.id, receivedAtMs: row.t }));
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[index] as number;
}

async function main(): Promise<void> {
  process.stdout.write(`\nmulti-hop propagation latency — ${NODES} nodes, ${SAMPLES} samples\n`);
  process.stdout.write(`chain jb-n0 … jb-n${NODES - 1}, publisher jb-n0\n`);
  process.stdout.write(
    PACE_MS > 0
      ? `regime: PACED at ${PACE_MS} ms between publications (unloaded path)\n\n`
      : 'regime: BURST — publishes as fast as accepted; hop 1 will include queueing\n\n',
  );

  const origin = urlFor(0);
  process.stdout.write('setup (proof of work, certificate, session, credential, community) … ');
  const ctx = await setup(origin);
  process.stdout.write('done\n');

  const ids: string[] = [];
  const startedAt = Date.now();
  for (let i = 0; i < SAMPLES; i += 1) {
    const receipt = await json<{ content_id: string }>(origin, '/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.token}` },
      body: JSON.stringify({
        envelope: base64(
          envelopeBytes(
            ctx.seed,
            'jb:post:create:v1',
            PostCreate.encode(
              PostCreate.fromPartial({
                title: `scale sample ${i}`,
                kind: PostKind.POST_KIND_TEXT,
                body_markdown: 'propagation latency sample',
              }),
            ).finish(),
            {
              credential: ctx.credential,
              // Per sample: a nullifier is spent on use, so every publication needs its own.
              nullifier: digest(`jb:post:create:v1\0${ctx.epoch}\0${ctx.salt}\0${i}`),
              epoch: ctx.epoch,
              pow: new Uint8Array(0),
            },
            ctx.communityId,
          ),
        ),
      }),
    });
    ids.push(receipt.content_id);
    if ((i + 1) % 25 === 0) {
      process.stdout.write(`  published ${i + 1}/${SAMPLES}\n`);
    }
    if (PACE_MS > 0 && i + 1 < SAMPLES) {
      await new Promise((done) => setTimeout(done, PACE_MS));
    }
  }
  process.stdout.write(`published ${ids.length} in ${Date.now() - startedAt} ms\n\nsettling … `);

  const wanted = new Set(ids);
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  let rows: readonly Row[] = [];
  for (;;) {
    rows = await collect();
    const lastHop = rows.filter((row) => row.node === NODES - 1 && wanted.has(row.id)).length;
    if (lastHop >= ids.length || Date.now() > deadline) {
      process.stdout.write(`${lastHop}/${ids.length} reached hop ${NODES - 1}\n\n`);
      break;
    }
    await new Promise((done) => setTimeout(done, 2000));
  }

  // origin timestamp per content id
  const originAt = new Map<string, number>();
  for (const row of rows) if (row.node === 0 && wanted.has(row.id)) originAt.set(row.id, row.receivedAtMs);

  const byHop = new Map<number, number[]>();
  const csv: string[] = ['content_id,hop,node_received_at_ms,origin_received_at_ms,latency_ms'];
  for (const row of rows) {
    if (row.node === 0 || !wanted.has(row.id)) continue;
    const base = originAt.get(row.id);
    if (base === undefined) continue;
    const latency = row.receivedAtMs - base;
    const bucket = byHop.get(row.node);
    if (bucket) bucket.push(latency);
    else byHop.set(row.node, [latency]);
    csv.push(`${row.id},${row.node},${row.receivedAtMs},${base},${latency}`);
  }

  process.stdout.write('hop   n     p50      p95      p99      min      max     per-hop\n');
  process.stdout.write('---  ----  -------  -------  -------  -------  -------  -------\n');
  let previousP50 = 0;
  const summary: string[] = ['hop,n,p50_ms,p95_ms,p99_ms,min_ms,max_ms,marginal_ms'];
  for (let hop = 1; hop < NODES; hop += 1) {
    const values = (byHop.get(hop) ?? []).slice().sort((a, b) => a - b);
    if (values.length === 0) {
      process.stdout.write(`${String(hop).padStart(3)}  ${String(0).padStart(4)}   (nothing arrived)\n`);
      continue;
    }
    const p50 = quantile(values, 0.5);
    const marginal = p50 - previousP50;
    previousP50 = p50;
    process.stdout.write(
      `${String(hop).padStart(3)}  ${String(values.length).padStart(4)}  ` +
        `${String(p50).padStart(7)}  ${String(quantile(values, 0.95)).padStart(7)}  ` +
        `${String(quantile(values, 0.99)).padStart(7)}  ${String(values[0]).padStart(7)}  ` +
        `${String(values[values.length - 1]).padStart(7)}  ${String(marginal).padStart(7)}\n`,
    );
    summary.push(
      `${hop},${values.length},${p50},${quantile(values, 0.95)},${quantile(values, 0.99)},${values[0]},${values[values.length - 1]},${marginal}`,
    );
  }

  const outDir = join(workspaceRoot(), 'ops', 'results');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'scale-latency.csv'), `${csv.join('\n')}\n`, 'utf8');
  writeFileSync(join(outDir, 'scale-latency-summary.csv'), `${summary.join('\n')}\n`, 'utf8');
  process.stdout.write(`\nwrote ops/results/scale-latency.csv (${csv.length - 1} rows)\n`);
  process.stdout.write('wrote ops/results/scale-latency-summary.csv\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`scale measurement failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
