#!/usr/bin/env node
/**
 * Phase 5 — Adversarial floods, multi-peer gRPC flood, concurrent valid traffic,
 * MongoDB collection-level profiler audit, and Docker resource profiling.
 * Addresses R1.5, R2.3, and R2.5.
 */

import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import {
  ByteWriter,
  FIELD,
  Plane,
  Priority,
  announceRequestSigningBytes,
  blindCredential,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  decodeSignedEnvelope,
  pqAttestationBytes,
  sealEnvelope,
  unblindCredential,
} from '../../packages/sdk-ts/dist/esm/index.js';
import {
  writeLengthDelimited,
  writeVarintField,
} from '../../packages/sdk-ts/dist/esm/core/wire.js';
import { ed25519, mldsa } from '../../packages/sdk-ts/dist/esm/crypto/index.js';
import { sampleDockerStats } from './lib/docker-stats.mjs';
import { summarize } from './lib/stats.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const require = createRequire(import.meta.url);
const backendRequire = createRequire(join(ROOT, 'backend', 'package.json'));
const argon2 = backendRequire('argon2');
const {
  AnnounceRequest,
  CheckIn,
  CommunityCreate,
  KeyCertificate,
  PostCreate,
  PostKind,
  TargetKind,
  VoteCast,
} = backendRequire('@jagoo/sdk/proto');
const { ChannelCredentials } = backendRequire('@grpc/grpc-js');
const { createChannel, createClient } = backendRequire('nice-grpc');
const { FederationWireDefinition } = require('../../backend/dist/adapters/inbound/grpc/raw-envelope-codec.js');
const { signCallMetadata } = require('../../backend/dist/adapters/inbound/grpc/peer-auth.js');

const exec = promisify(execFile);
const COMPOSE = join(HERE, 'stress-compose.yml');

const BASE_HTTP = 'http://127.0.0.1:3300';
const GRPC_ADDR = '127.0.0.1:8444';
const CONTAINERS = ['jb-stress-node', 'jb-stress-mongo', 'jb-stress-redis'];

const text = new TextEncoder();
const b64 = (v) => Buffer.from(v).toString('base64');
const fromB64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const digest = (s) => new Uint8Array(createHash('sha256').update(s, 'utf8').digest());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCmd(cmd, args, env = {}) {
  const { stdout } = await exec(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function composeUp(reqLimit) {
  await runCmd('docker', ['compose', '-f', COMPOSE, 'down', '-v']).catch(() => '');
  await runCmd('docker', ['compose', '-f', COMPOSE, 'up', '-d', '--wait'], {
    STRESS_REQ_LIMIT: String(reqLimit),
  });
}

async function composeDown() {
  await runCmd('docker', ['compose', '-f', COMPOSE, 'down', '-v']).catch(() => '');
}

async function mongoshEval(js) {
  const stdout = await runCmd('docker', [
    'exec',
    'jb-stress-mongo',
    'mongosh',
    '--quiet',
    '--eval',
    js,
  ]);
  return JSON.parse(stdout.trim());
}

async function getDbState() {
  return mongoshEval(`
    const d = db.getSiblingDB('jagoo_stress');
    print(JSON.stringify({
      envelopes: d.envelopes.countDocuments(),
      merkleLeaves: d.merkle_leaves.countDocuments(),
      posts: d.forum_posts.countDocuments(),
      communities: d.forum_communities.countDocuments(),
      profileCount: d.system.profile.countDocuments()
    }));
  `);
}

async function enableProfilerAndReset() {
  return mongoshEval(`
    const d = db.getSiblingDB('jagoo_stress');
    d.setProfilingLevel(0);
    d.system.profile.drop();
    d.setProfilingLevel(2);
    print(JSON.stringify({ ok: true }));
  `);
}

async function readProfilerWindow(sinceIso) {
  return mongoshEval(`
    const d = db.getSiblingDB('jagoo_stress');
    const since = new Date(${JSON.stringify(sinceIso)});
    const docs = d.system.profile.find({ ts: { $gte: since }, ns: { $not: /\\.system\\./ } }).toArray();
    const writes = docs.filter((x) => ['insert', 'update', 'remove'].includes(x.op));
    const reads = docs.filter((x) => ['query', 'getmore', 'count'].includes(x.op));
    print(JSON.stringify({
      totalOps: docs.length,
      writeOps: writes.length,
      readOps: reads.length,
      writeNamespaces: [...new Set(writes.map((w) => w.ns))]
    }));
  `);
}

function makeEnvelope(
  seed,
  domain,
  body,
  antiAbuse,
  scope = '',
  customNonce = null,
  plane = Plane.FORUM,
  nowMsOverride = null,
) {
  const unsigned = buildEnvelope({
    domain,
    plane,
    authorKey: ed25519.derivePublicKey(seed),
    body,
    nowMs: BigInt(nowMsOverride ?? Date.now()),
    nonce: customNonce ?? new Uint8Array(randomBytes(16)),
    antiAbuse,
    scope,
  });
  return sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), seed)).wireBytes;
}

async function httpJson(path, init) {
  const res = await fetch(`${BASE_HTTP}${path}`, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.text();
  let parsed = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${res.status} ${parsed.detail ?? body}`);
  }
  return parsed;
}

async function solvePow(challenge, authorKey) {
  const challengeBytes = fromB64(challenge.challenge);
  const h = await argon2.hash(Buffer.from(challengeBytes).toString('hex'), {
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
  proof.set(h, 41);
  return proof;
}

async function createCertifiedIdentity(tag) {
  const seed = digest(tag);
  const publicKey = ed25519.derivePublicKey(seed);
  const validFrom = BigInt(Date.now() - 60_000);
  const validUntil = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pq = mldsa.generateKeyPair(digest(`${tag}-pq`));
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

  const powChallenge = await httpJson('/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: b64(publicKey) }),
  });
  const pow = await solvePow(powChallenge, publicKey);
  await httpJson('/v1/envelopes', {
    method: 'POST',
    body: JSON.stringify({
      envelope: b64(
        makeEnvelope(seed, 'jb:key:certify:forum:v1', certificate, {
          credential: new Uint8Array(0),
          nullifier: new Uint8Array(0),
          epoch: 0,
          pow,
        }),
      ),
    }),
  });

  const challenged = await httpJson(`/v1/auth/challenge?public_key=${encodeURIComponent(b64(publicKey))}`);
  const authBytes = new Uint8Array([
    ...text.encode('jb-auth-v1\0login\0'),
    ...publicKey,
    ...fromB64(challenged.challenge),
  ]);
  const session = await httpJson('/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: b64(publicKey),
      challenge: challenged.challenge,
      claim: challenged.claim,
      signature: b64(ed25519.sign(authBytes, seed)),
    }),
  });

  const params = await httpJson('/v1/credentials/parameters');
  const blinded = blindCredential(params, new Uint8Array(randomBytes(32)), new Uint8Array(randomBytes(params.width)));
  const issued = await httpJson('/v1/credentials/request', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({ blinded: b64(blinded.blinded) }),
  });
  const credential = unblindCredential(blinded.state, fromB64(issued.blindSignature));
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));

  const commBody = CommunityCreate.encode(
    CommunityCreate.fromPartial({
      name: tag,
      title: `Stress ${tag}`,
      description: 'Stress suite community',
    }),
  ).finish();
  await httpJson('/v1/envelopes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      envelope: b64(
        makeEnvelope(seed, 'jb:community:create:v1', commBody, {
          credential,
          nullifier: digest(`jb:community:create:v1\0${epoch}\0${tag}`),
          epoch,
          pow,
        }),
      ),
    }),
  });

  const listed = await httpJson(`/v1/communities?q=${encodeURIComponent(tag)}`);
  const communityId = listed.items.find((x) => x.name === tag)?.id;
  if (!communityId) throw new Error(`community missing for ${tag}`);

  return { tag, seed, credential, epoch, communityId, token: session.accessToken };
}

function buildValidPostWire(id, idx, customNonce = null) {
  const body = PostCreate.encode(
    PostCreate.fromPartial({
      title: `stress post ${id.tag} #${idx}`,
      kind: PostKind.POST_KIND_TEXT,
      body_markdown: `Stress payload ${id.tag} index ${idx}`,
    }),
  ).finish();
  return makeEnvelope(
    id.seed,
    'jb:post:create:v1',
    body,
    {
      credential: id.credential,
      nullifier: digest(`jb:post:create:v1\0${id.epoch}\0${id.tag}\0${idx}`),
      epoch: id.epoch,
      pow: new Uint8Array(0),
    },
    id.communityId,
    customNonce,
  );
}

function buildValidVoteWire(id, targetPostId, value, customNonce, nowMsOverride) {
  const body = VoteCast.encode(
    VoteCast.fromPartial({
      target: targetPostId,
      target_kind: TargetKind.TARGET_KIND_POST,
      value,
    }),
  ).finish();
  return makeEnvelope(
    id.seed,
    'jb:vote:cast:v1',
    body,
    {
      credential: id.credential,
      nullifier: new Uint8Array(0),
      epoch: id.epoch,
      pow: new Uint8Array(0),
    },
    id.communityId,
    customNonce,
    Plane.FORUM,
    nowMsOverride,
  );
}

function mutateSigRegion(baseBuf, i) {
  const buf = Buffer.from(baseBuf);
  const pos = 24 + (i % Math.max(1, buf.length - 96));
  buf[pos] = (buf[pos] + 1 + (i % 251)) & 0xff;
  return buf;
}

function makeMalformedPayloads() {
  const list = [];
  // 0: descending fields
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.PLANE, 1n);
    writeVarintField(w, FIELD.VERSION, 1n);
    list.push(w.finish());
  }
  // 1: unknown envelope field 99
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeVarintField(w, 99, 1n);
    list.push(w.finish());
  }
  // 2: unsupported wire type 7
  {
    const w = new ByteWriter(32);
    w.tag(FIELD.VERSION, 7);
    w.bytes(new Uint8Array([1, 2, 3, 4]));
    list.push(w.finish());
  }
  // 3: truncated varint
  {
    const w = new ByteWriter(16);
    w.tag(FIELD.VERSION, 0);
    w.byte(0x80);
    list.push(w.finish());
  }
  // 4: overlong varint
  {
    const w = new ByteWriter(32);
    w.tag(FIELD.VERSION, 0);
    for (let j = 0; j < 11; j += 1) w.byte(0x80);
    w.byte(0x01);
    list.push(w.finish());
  }
  // 5: length past buffer
  {
    const w = new ByteWriter(16);
    w.tag(FIELD.DOMAIN, 2);
    w.varint(99n);
    w.bytes(new Uint8Array([1, 2]));
    list.push(w.finish());
  }
  // 6: invalid UTF-8
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.DOMAIN, new Uint8Array([0xff, 0xfe]));
    list.push(w.finish());
  }
  // 7: non-NFC string
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.SCOPE, text.encode('cafe\u0301'));
    list.push(w.finish());
  }
  // 8: explicit zero varint
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeVarintField(w, FIELD.PLANE, 0n);
    list.push(w.finish());
  }
  // 9: uint32 overflow
  {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 0x1_0000_0000n);
    list.push(w.finish());
  }
  return list;
}

async function runHttpBatch(total, concurrency, payloadFn, headersFn = null) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const codes = new Map();
  const statuses = new Map();
  const latencies = new Array(total);
  let nextIdx = 0;

  const postOne = (i) =>
    new Promise((resolveReq) => {
      const payload = payloadFn(i);
      const body = JSON.stringify({ envelope: payload });
      const extraHeaders = headersFn ? headersFn(i) : {};
      const t0 = performance.now();
      const req = http.request(
        {
          host: '127.0.0.1',
          port: 3300,
          path: '/v1/envelopes',
          method: 'POST',
          agent,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            ...extraHeaders,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            latencies[i] = Math.round((performance.now() - t0) * 1000) / 1000;
            const st = String(res.statusCode);
            statuses.set(st, (statuses.get(st) ?? 0) + 1);
            let code = `http_${res.statusCode}`;
            try {
              const p = JSON.parse(data);
              code = p.code ?? p.error ?? (res.statusCode < 300 ? 'ACCEPTED' : p.detail ?? code);
            } catch {
              /* non-json */
            }
            codes.set(String(code).slice(0, 64), (codes.get(String(code).slice(0, 64)) ?? 0) + 1);
            resolveReq();
          });
        },
      );
      req.on('error', (e) => {
        latencies[i] = Math.round((performance.now() - t0) * 1000) / 1000;
        const k = `neterr_${e.code ?? 'unknown'}`;
        codes.set(k, (codes.get(k) ?? 0) + 1);
        statuses.set('0', (statuses.get('0') ?? 0) + 1);
        resolveReq();
      });
      req.end(body);
    });

  const startedAt = Date.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const i = nextIdx;
        if (i >= total) return;
        nextIdx += 1;
        await postOne(i);
      }
    }),
  );
  const durationMs = Date.now() - startedAt;
  agent.destroy();

  return {
    sent: total,
    concurrency,
    durationMs,
    rps: Math.round((total / Math.max(1, durationMs)) * 1000),
    http500Count: statuses.get('500') ?? 0,
    statuses: Object.fromEntries([...statuses.entries()].sort((a, b) => b[1] - a[1])),
    codes: Object.fromEntries([...codes.entries()].sort((a, b) => b[1] - a[1])),
    latencyMs: summarize(latencies.filter((x) => typeof x === 'number'), total),
  };
}

async function runGrpcMultiPeerFlood() {
  const channel = createChannel(GRPC_ADDR, ChannelCredentials.createInsecure());
  const client = createClient(FederationWireDefinition, channel);

  const peers = [];
  for (let p = 0; p < 5; p += 1) {
    const seed = new Uint8Array(32).fill(0x70 + p);
    const publicKey = ed25519.derivePublicKey(seed);
    const nowMs = Date.now();
    const nonce = new Uint8Array(randomBytes(16));
    const fields = {
      serverKey: publicKey,
      displayName: `flood-peer-${p}`,
      software: 'stress-peer',
      version: '1.0',
      endpoints: [],
      communities: [],
      channels: [],
      planes: [Plane.FORUM, Plane.SIGNAL],
      acceptedClasses: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN],
      currentSth: undefined,
      timestampMs: BigInt(nowMs),
      nonce,
    };
    const sig = ed25519.sign(announceRequestSigningBytes(fields), seed);
    const resp = await client.announce(
      AnnounceRequest.fromPartial({
        server_key: publicKey,
        display_name: `flood-peer-${p}`,
        software: 'stress-peer',
        version: '1.0',
        endpoints: [],
        communities: [],
        channels: [],
        planes: [Plane.FORUM, Plane.SIGNAL],
        accepted_classes: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN],
        timestamp_ms: BigInt(nowMs),
        nonce,
        signature: sig,
      }),
      {
        metadata: signCallMetadata('Announce', publicKey, (m) => ed25519.sign(m, seed), nowMs, new Uint8Array(randomBytes(16))),
      },
    );
    peers.push({ id: p, seed, publicKey, assignedTrust: resp.assigned });
  }

  // Build valid-format mutated CHECKIN envelopes (class 2, Plane.SIGNAL, permitted for PROBATION)
  const checkinBody = CheckIn.encode(CheckIn.fromPartial({ status: 1 })).finish();
  const baseCheckin = makeEnvelope(
    digest('grpc-checkin-author'),
    'jb:checkin:post:v1',
    checkinBody,
    undefined,
    '',
    null,
    Plane.SIGNAL,
  );

  // 1) Coordinated invalid-signature flood across 5 peers (100 CHECKIN frames each = 500 frames)
  const beforeInvalidDb = await getDbState();
  const invalidWindowStart = new Date().toISOString();
  const t0Invalid = Date.now();
  const invalidOutcomes = await Promise.all(
    peers.map(async (peer) => {
      const frames = Array.from({ length: 100 }, (_, i) => mutateSigRegion(baseCheckin, peer.id * 100 + i));
      const nowMs = Date.now();
      const ack = await client.deliver(
        (async function* () {
          for (const f of frames) yield f;
        })(),
        {
          metadata: signCallMetadata('Deliver', peer.publicKey, (m) => ed25519.sign(m, peer.seed), nowMs, new Uint8Array(randomBytes(16))),
        },
      );
      return {
        peer: peer.id,
        accepted: ack.accepted.length,
        rejected: ack.rejected.length,
        badSig: ack.rejected.filter((r) => r.code === 8).length,
        rateLimited: ack.rejected.filter((r) => r.code === 19).length,
      };
    }),
  );
  const invalidDurationMs = Date.now() - t0Invalid;
  const invalidProf = await readProfilerWindow(invalidWindowStart);
  const afterInvalidDb = await getDbState();

  // 2) Coordinated over-quota & class-3 breach flood -> triggers RATE_LIMITED + FD-16 BLOCKED demotion
  const beforeQuotaDb = await getDbState();
  const quotaWindowStart = new Date().toISOString();
  const quotaRounds = [];
  for (let round = 0; round < 4; round += 1) {
    const roundRes = await Promise.all(
      peers.map(async (peer) => {
        const frames = Array.from({ length: 50 }, (_, i) =>
          mutateSigRegion(baseCheckin, 1000 + round * 500 + peer.id * 50 + i),
        );
        const nowMs = Date.now();
        try {
          const ack = await client.deliver(
            (async function* () {
              for (const f of frames) yield f;
            })(),
            {
              metadata: signCallMetadata('Deliver', peer.publicKey, (m) => ed25519.sign(m, peer.seed), nowMs, new Uint8Array(randomBytes(16))),
            },
          );
          return {
            peer: peer.id,
            status: 'OK',
            accepted: ack.accepted.length,
            rejected: ack.rejected.length,
            rateLimited: ack.rejected.filter((r) => r.code === 19).length,
            badSig: ack.rejected.filter((r) => r.code === 8).length,
            backpressureHintMs: ack.backpressure_hint_ms,
          };
        } catch (err) {
          return {
            peer: peer.id,
            status: 'RPC_ERROR',
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      }),
    );
    quotaRounds.push({ round: round + 1, peers: roundRes });
  }
  const quotaProf = await readProfilerWindow(quotaWindowStart);
  const afterQuotaDb = await getDbState();
  channel.close();

  return {
    peerCount: peers.length,
    initialAssignedTrust: peers.map((p) => p.assignedTrust),
    invalidSigFlood: {
      totalFrames: 500,
      durationMs: invalidDurationMs,
      perPeer: invalidOutcomes,
      profiler: invalidProf,
      dbDelta: {
        envelopes: afterInvalidDb.envelopes - beforeInvalidDb.envelopes,
        merkleLeaves: afterInvalidDb.merkleLeaves - beforeInvalidDb.merkleLeaves,
      },
    },
    overQuotaDemotionTest: {
      rounds: quotaRounds,
      profiler: quotaProf,
      dbDelta: {
        envelopes: afterQuotaDb.envelopes - beforeQuotaDb.envelopes,
        merkleLeaves: afterQuotaDb.merkleLeaves - beforeQuotaDb.merkleLeaves,
      },
    },
  };
}

async function main() {
  const report = {
    recordedAt: new Date().toISOString(),
    regimes: {},
  };

  try {
    // ── 5a: Baseline invalid-signature flood with default HTTP limiter (300/min) ──────
    process.stdout.write('\n[5a] Bringing up node with default HTTP limiter (300/min)...\n');
    await composeUp(300);
    const baseId = await createCertifiedIdentity('stress_base');
    const sampleWire = buildValidPostWire(baseId, 0);
    await httpJson('/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${baseId.token}` },
      body: JSON.stringify({ envelope: b64(sampleWire) }),
    });
    await enableProfilerAndReset();
    const idleStats = await sampleDockerStats(CONTAINERS);
    const db5aBefore = await getDbState();
    const win5a = new Date().toISOString();
    const res5a = await runHttpBatch(3000, 16, (i) => b64(mutateSigRegion(sampleWire, i)));
    const prof5a = await readProfilerWindow(win5a);
    const db5aAfter = await getDbState();
    const stats5a = await sampleDockerStats(CONTAINERS);
    report.regimes.invalidSigDefaultLimiter = {
      http: res5a,
      profiler: prof5a,
      dbDelta: {
        envelopes: db5aAfter.envelopes - db5aBefore.envelopes,
        merkleLeaves: db5aAfter.merkleLeaves - db5aBefore.merkleLeaves,
      },
      resources: { idle: idleStats, peak: stats5a },
    };
    process.stdout.write(`  5a: rps=${res5a.rps} codes=${JSON.stringify(res5a.codes)} dbWrites=${prof5a.writeOps}\n`);

    // ── Bring up fresh node with raised HTTP limiter for 5b..5f ─────────────────────
    process.stdout.write('\n[5b-5f] Restarting clean node with raised HTTP limiter (1,000,000/min)...\n');
    await composeUp(1_000_000);
    const idMain = await createCertifiedIdentity('stress_main');
    const validNonce = new Uint8Array(randomBytes(16));
    const seedPostWire = buildValidPostWire(idMain, 0, validNonce);
    const seedPostReceipt = await httpJson('/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idMain.token}` },
      body: JSON.stringify({ envelope: b64(seedPostWire) }),
    });
    const seedPostId = seedPostReceipt.content_id;
    if (!seedPostId) {
      throw new Error(`Expected seedPostReceipt.content_id, got ${JSON.stringify(seedPostReceipt)}`);
    }
    await enableProfilerAndReset();

    // 5b: Invalid-signature flood (pipeline saturation)
    process.stdout.write('[5b] Running invalid-signature pipeline saturation (3,000 req, c=16)...\n');
    const db5bBefore = await getDbState();
    const win5b = new Date().toISOString();
    const res5b = await runHttpBatch(3000, 16, (i) => b64(mutateSigRegion(seedPostWire, i)));
    const prof5b = await readProfilerWindow(win5b);
    const db5bAfter = await getDbState();
    const stats5b = await sampleDockerStats(CONTAINERS);
    report.regimes.invalidSigPipelineSaturation = {
      http: res5b,
      profiler: prof5b,
      dbDelta: {
        envelopes: db5bAfter.envelopes - db5bBefore.envelopes,
        merkleLeaves: db5bAfter.merkleLeaves - db5bBefore.merkleLeaves,
      },
      resources: stats5b,
    };
    process.stdout.write(`  5b: rps=${res5b.rps} codes=${JSON.stringify(res5b.codes)} dbWrites=${prof5b.writeOps} reads=${prof5b.readOps}\n`);

    // 5c: Malformed protobuf flood
    process.stdout.write('[5c] Running malformed protobuf flood (3,000 req, c=16)...\n');
    const malformedList = makeMalformedPayloads();
    const db5cBefore = await getDbState();
    const win5c = new Date().toISOString();
    const res5c = await runHttpBatch(3000, 16, (i) => b64(malformedList[i % malformedList.length]));
    const prof5c = await readProfilerWindow(win5c);
    const db5cAfter = await getDbState();
    report.regimes.malformedProtobufFlood = {
      http: res5c,
      profiler: prof5c,
      dbDelta: {
        envelopes: db5cAfter.envelopes - db5cBefore.envelopes,
        merkleLeaves: db5cAfter.merkleLeaves - db5cBefore.merkleLeaves,
      },
    };
    process.stdout.write(`  5c: rps=${res5c.rps} http500=${res5c.http500Count} codes=${JSON.stringify(res5c.codes)} dbWrites=${prof5c.writeOps}\n`);

    // 5d-1: Exact duplicate flood (1,000 req, c=16)
    process.stdout.write('[5d-1] Running exact duplicate flood (1,000 req, c=16)...\n');
    const db5d1Before = await getDbState();
    const win5d1 = new Date().toISOString();
    const res5d1 = await runHttpBatch(1000, 16, () => b64(seedPostWire));
    const prof5d1 = await readProfilerWindow(win5d1);
    const db5d1After = await getDbState();
    report.regimes.exactDuplicateFlood = {
      http: res5d1,
      profiler: prof5d1,
      dbDelta: {
        envelopes: db5d1After.envelopes - db5d1Before.envelopes,
        merkleLeaves: db5d1After.merkleLeaves - db5d1Before.merkleLeaves,
      },
    };
    process.stdout.write(`  5d-1: rps=${res5d1.rps} statuses=${JSON.stringify(res5d1.statuses)} dbDeltaEnv=${db5d1After.envelopes - db5d1Before.envelopes}\n`);

    // 5d-2: Nonce replay flood (1,000 distinct content_id requests on non-idempotent jb:vote:cast:v1 reusing spent nonce)
    process.stdout.write('[5d-2] Running nonce replay flood (1,000 req, c=16)...\n');
    const voteNonce = new Uint8Array(randomBytes(16));
    const seedVoteWire = buildValidVoteWire(idMain, seedPostId, 1, voteNonce, Date.now());
    const seedVoteReceipt = await httpJson('/v1/envelopes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idMain.token}` },
      body: JSON.stringify({ envelope: b64(seedVoteWire) }),
    });
    if (!seedVoteReceipt.content_id) {
      throw new Error(`Expected seedVoteReceipt.content_id, got ${JSON.stringify(seedVoteReceipt)}`);
    }
    const baseVoteMs = Date.now();
    const replayWires = Array.from({ length: 1000 }, (_, i) =>
      b64(buildValidVoteWire(idMain, seedPostId, [1, 0, -1][i % 3], voteNonce, baseVoteMs - 1000 - i)),
    );
    const db5d2Before = await getDbState();
    const win5d2 = new Date().toISOString();
    const res5d2 = await runHttpBatch(
      1000,
      16,
      (i) => replayWires[i],
      () => ({ Authorization: `Bearer ${idMain.token}` }),
    );
    const prof5d2 = await readProfilerWindow(win5d2);
    const db5d2After = await getDbState();
    report.regimes.nonceReplayFlood = {
      domain: 'jb:vote:cast:v1',
      http: res5d2,
      profiler: prof5d2,
      dbDelta: {
        envelopes: db5d2After.envelopes - db5d2Before.envelopes,
        merkleLeaves: db5d2After.merkleLeaves - db5d2Before.merkleLeaves,
      },
    };
    process.stdout.write(`  5d-2: rps=${res5d2.rps} codes=${JSON.stringify(res5d2.codes)} dbWrites=${prof5d2.writeOps}\n`);

    // 5e: Coordinated multi-peer gRPC Deliver flood
    process.stdout.write('[5e] Running coordinated multi-peer gRPC flood (5 peers)...\n');
    const res5e = await runGrpcMultiPeerFlood();
    report.regimes.coordinatedMultiPeerGrpcFlood = res5e;
    process.stdout.write(`  5e: invalidSigWrites=${res5e.invalidSigFlood.profiler.writeOps} quotaRounds=${res5e.overQuotaDemotionTest.rounds.length}\n`);

    // 5f: Concurrent valid-traffic scalability (c = 1, 4, 16, 32; N = 200 each)
    process.stdout.write('[5f] Preparing 32 certified identities for valid concurrent write tests...\n');
    const pool = [];
    for (let u = 0; u < 32; u += 1) {
      pool.push(await createCertifiedIdentity(`valid_pool_${String(u).padStart(2, '0')}`));
    }
    const validRounds = {};
    let postSeq = 0;
    for (const conc of [1, 4, 16, 32]) {
      const nWrites = 200;
      const items = Array.from({ length: nWrites }, (_, i) => {
        const id = pool[i % pool.length];
        postSeq += 1;
        return {
          b64: b64(buildValidPostWire(id, 100_000 + postSeq)),
          token: id.token,
        };
      });
      const dbBefore = await getDbState();
      const res = await runHttpBatch(
        nWrites,
        conc,
        (i) => items[i].b64,
        (i) => ({ Authorization: `Bearer ${items[i].token}` }),
      );
      const dbAfter = await getDbState();
      const stats = await sampleDockerStats(CONTAINERS);
      validRounds[`c_${conc}`] = {
        http: res,
        dbDelta: {
          envelopes: dbAfter.envelopes - dbBefore.envelopes,
          merkleLeaves: dbAfter.merkleLeaves - dbBefore.merkleLeaves,
          posts: dbAfter.posts - dbBefore.posts,
        },
        resources: stats,
      };
      process.stdout.write(
        `  5f c=${conc}: rps=${res.rps} p50=${res.latencyMs.median}ms p95=${res.latencyMs.p95}ms envDelta=${dbAfter.envelopes - dbBefore.envelopes}\n`,
      );
    }
    report.regimes.concurrentValidWrites = validRounds;
  } finally {
    await composeDown();
  }

  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '05-stress-and-valid-load.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
}

void main().catch((err) => {
  process.stderr.write(`stress-suite failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
