#!/usr/bin/env node
/**
 * Phase 7 — End-to-end ActivityPub / HTTP-inbox vs. Jagoo Bahee comparison
 * under equivalent constrained/lossy and asymmetric-reachability (CGNAT) conditions.
 * Addresses R1.4 and R2.6.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sampleDockerStats } from './lib/docker-stats.mjs';
import { round3, summarize } from './lib/stats.mjs';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const COMPOSE = join(HERE, 'ap-cmp-compose.yml');
const NETEM_IMAGE = 'jb-netem:local';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCmd(cmd, args, opts = {}) {
  const { stdout } = await exec(cmd, args, {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
  return stdout;
}

async function tryCmd(cmd, args) {
  return runCmd(cmd, args).catch(() => '');
}

function writeCompareCompose() {
  const yml = `name: jagoo-ap-cmp

services:
  mongo:
    image: mongo:7
    container_name: jb-cmp-mongo
    command: ['--replSet', 'rs0', '--bind_ip_all', '--quiet']
    networks:
      db_net:
        ipv4_address: 10.95.1.5
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "db.adminCommand('ping').ok || quit(1)"]
      interval: 2s
      timeout: 5s
      retries: 30
      start_period: 3s

  mongo-init:
    image: mongo:7
    container_name: jb-cmp-mongo-init
    networks: [db_net]
    restart: 'no'
    depends_on:
      mongo: { condition: service_healthy }
    entrypoint:
      - mongosh
      - --host
      - mongo:27017
      - --quiet
      - --eval
      - |
        try { rs.status(); } catch (e) { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }); }
        for (let i = 0; i < 60; i++) { if (db.hello().isWritablePrimary) { print('rs0 PRIMARY ready'); quit(0); } sleep(500); }
        quit(1);

  redis:
    image: redis:7-alpine
    container_name: jb-cmp-redis
    networks:
      db_net:
        ipv4_address: 10.95.1.6
    command: ['redis-server', '--appendonly', 'no']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 2s
      timeout: 3s
      retries: 20

  jb-cmp-a:
    image: jb-node:local
    pull_policy: never
    container_name: jb-cmp-a
    networks:
      db_net:
        ipv4_address: 10.95.1.10
      wan_net:
        ipv4_address: 10.95.2.10
    ports:
      - '3401:3000'
    depends_on:
      mongo-init: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    environment:
      NODE_ENV: development
      NODE_NAME: 'cmp-a'
      PORT: '3000'
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444'
      FEDERATION_DRAIN_INTERVAL_MS: '500'
      FEDERATION_GOSSIP_INTERVAL_MS: '15000'
      MONGO_URL: 'mongodb://mongo:27017/jagoo_cmp_a?replicaSet=rs0'
      REDIS_URL: 'redis://redis:6379/0'
      NODE_SIGNING_SEED: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE='
      FEDERATION_ENDPOINTS: 'GLOBAL=grpc://10.95.2.10:8444'
      FEDERATION_PEERS: 'IVL40Zt5HSRFMkLhXy6rbLfP+ntqXtMAl5YOBpiB2xI=@GLOBAL=grpc://10.95.2.11:8444#TRUSTED,Ivwpd5Lwtv/Av8/bftsMCqFOAlo2XsDjQuhuOCnLdLY=@GLOBAL=grpc://10.95.2.12:8444#TRUSTED'
      ADMIN_KEYS: 'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c'
      AUTH_ACCESS_SECRET: 'ERERERERERERERERERERERERERERERERERERERERERE='
      AUTH_REFRESH_SECRET: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI='
      POW_SECRET: 'MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM='
      BLOB_FILESYSTEM_ROOT: '/tmp/blobs'
      SERVICE_DISCOVERY_PROBE: 'false'
      REQUEST_LIMIT_PER_MINUTE: '100000'
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 40

  jb-cmp-b:
    image: jb-node:local
    pull_policy: never
    container_name: jb-cmp-b
    networks:
      db_net:
        ipv4_address: 10.95.1.11
      wan_net:
        ipv4_address: 10.95.2.11
    ports:
      - '3402:3000'
    depends_on:
      mongo-init: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    environment:
      NODE_ENV: development
      NODE_NAME: 'cmp-b'
      PORT: '3000'
      FEDERATION_GRPC_LISTEN: '0.0.0.0:8444'
      FEDERATION_DRAIN_INTERVAL_MS: '500'
      FEDERATION_GOSSIP_INTERVAL_MS: '15000'
      MONGO_URL: 'mongodb://mongo:27017/jagoo_cmp_b?replicaSet=rs0'
      REDIS_URL: 'redis://redis:6379/1'
      NODE_SIGNING_SEED: 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI='
      FEDERATION_ENDPOINTS: 'GLOBAL=grpc://10.95.2.11:8444'
      FEDERATION_PEERS: '25lf4lFp0UHKubu6krqgH58uHs599MsqwFGQ83/MH50=@GLOBAL=grpc://10.95.2.10:8444#TRUSTED'
      ADMIN_KEYS: 'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c'
      AUTH_ACCESS_SECRET: 'ERERERERERERERERERERERERERERERERERERERERERE='
      AUTH_REFRESH_SECRET: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI='
      POW_SECRET: 'MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM='
      BLOB_FILESYSTEM_ROOT: '/tmp/blobs'
      SERVICE_DISCOVERY_PROBE: 'false'
      REQUEST_LIMIT_PER_MINUTE: '100000'
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 40

  ap-cmp-a:
    image: jb-node:local
    pull_policy: never
    container_name: ap-cmp-a
    networks:
      db_net:
        ipv4_address: 10.95.1.20
      wan_net:
        ipv4_address: 10.95.2.20
    ports:
      - '3411:3000'
    volumes:
      - ./lib/ap-inbox-server.cjs:/app/ap-inbox-server.cjs:ro
    environment:
      AP_PORT: '3000'
      AP_SELF_ID: 'ap-a'
      AP_PEER_URL: 'http://10.95.2.21:3000'
    command: ['node', '/app/ap-inbox-server.cjs']
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 20

  ap-cmp-b:
    image: jb-node:local
    pull_policy: never
    container_name: ap-cmp-b
    networks:
      db_net:
        ipv4_address: 10.95.1.21
      wan_net:
        ipv4_address: 10.95.2.21
    ports:
      - '3412:3000'
    volumes:
      - ./lib/ap-inbox-server.cjs:/app/ap-inbox-server.cjs:ro
    environment:
      AP_PORT: '3000'
      AP_SELF_ID: 'ap-b'
      AP_PEER_URL: 'http://10.95.2.20:3000'
    command: ['node', '/app/ap-inbox-server.cjs']
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 20

  jb-cmp-nat:
    profiles: ['cgnat']
    image: jb-node:local
    pull_policy: never
    container_name: jb-cmp-nat
    networks:
      db_net:
        ipv4_address: 10.95.1.12
      wan_net:
        ipv4_address: 10.95.2.12
    depends_on:
      mongo-init: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    environment:
      NODE_ENV: development
      NODE_NAME: 'cmp-nat'
      PORT: '3000'
      FEDERATION_OUTBOUND_ONLY: 'true'
      FEDERATION_DRAIN_INTERVAL_MS: '500'
      FEDERATION_GOSSIP_INTERVAL_MS: '15000'
      MONGO_URL: 'mongodb://mongo:27017/jagoo_cmp_nat?replicaSet=rs0'
      REDIS_URL: 'redis://redis:6379/2'
      NODE_SIGNING_SEED: 'Q0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0M='
      FEDERATION_PEERS: '25lf4lFp0UHKubu6krqgH58uHs599MsqwFGQ83/MH50=@GLOBAL=grpc://10.95.2.10:8444#TRUSTED'
      ADMIN_KEYS: 'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c'
      AUTH_ACCESS_SECRET: 'ERERERERERERERERERERERERERERERERERERERERERE='
      AUTH_REFRESH_SECRET: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI='
      POW_SECRET: 'MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM='
      BLOB_FILESYSTEM_ROOT: '/tmp/blobs'
      SERVICE_DISCOVERY_PROBE: 'false'
      REQUEST_LIMIT_PER_MINUTE: '100000'
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 2s
      timeout: 5s
      retries: 40

networks:
  db_net:
    driver: bridge
    ipam:
      config:
        - subnet: 10.95.1.0/24
  wan_net:
    driver: bridge
    ipam:
      config:
        - subnet: 10.95.2.0/24
`;
  writeFileSync(COMPOSE, yml, 'utf8');
}

async function ensureNetemImage() {
  const existing = await tryCmd('docker', ['image', 'inspect', NETEM_IMAGE]);
  if (existing.trim()) return;
  await runCmd('docker', ['run', '--name', 'jb-netem-builder', 'alpine:latest', 'sh', '-c', 'apk add --no-cache iproute2 iptables']);
  try {
    await runCmd('docker', ['commit', 'jb-netem-builder', NETEM_IMAGE]);
  } finally {
    await tryCmd('docker', ['rm', '-f', 'jb-netem-builder']);
  }
}

async function netemExec(container, args) {
  return runCmd('docker', ['run', '--rm', '--cap-add=NET_ADMIN', `--net=container:${container}`, NETEM_IMAGE, ...args]);
}

async function detectWanIface(container) {
  const out = await netemExec(container, ['ip', '-o', '-4', 'addr', 'show']);
  for (const line of out.split('\n')) {
    const m = /^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)/.exec(line.trim());
    if (m && m[2].startsWith('10.95.2.')) return m[1];
  }
  throw new Error(`Could not find wan_net (10.95.2.x) interface in ${container}:\n${out}`);
}

async function readTxBytes(container, iface) {
  const out = await runCmd('docker', ['exec', container, 'cat', `/sys/class/net/${iface}/statistics/tx_bytes`]);
  return Number(out.trim());
}

async function getJbTimes(dbName, ids) {
  const script = `
    const map = {};
    db.getSiblingDB(${JSON.stringify(dbName)}).envelopes
      .find({ _id: { $in: ${JSON.stringify(ids)} } }, { received_at_ms: 1 })
      .forEach((d) => { map[d._id] = d.received_at_ms; });
    print(JSON.stringify(map));
  `;
  const stdout = await runCmd('docker', ['exec', 'jb-cmp-mongo', 'mongosh', '--quiet', '--eval', script]);
  return JSON.parse(stdout.trim());
}

async function waitForJbIds(dbName, ids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let found = {};
  while (Date.now() <= deadline) {
    found = await getJbTimes(dbName, ids);
    if (Object.keys(found).length >= ids.length) return found;
    await sleep(300);
  }
  return found;
}

async function main() {
  writeCompareCompose();
  await ensureNetemImage();

  await tryCmd('docker', ['compose', '-f', COMPOSE, '--profile', 'cgnat', 'down', '-v']);
  await runCmd('docker', ['compose', '-f', COMPOSE, 'up', '-d', '--wait']);
  await sleep(10_000); // let JB peers handshake

  const wanIf = new Map();
  for (const c of ['jb-cmp-a', 'jb-cmp-b', 'ap-cmp-a', 'ap-cmp-b']) {
    wanIf.set(c, await detectWanIface(c));
  }

  const report = {
    recordedAt: new Date().toISOString(),
    wanInterfaces: Object.fromEntries(wanIf),
    methodologyNote:
      'Compares a 2-node Jagoo Bahee deployment (gRPC caller-initiated federation) against a minimal Node.js ActivityPub HTTP-inbox baseline (gzip JSON-LD Create/Note with 927-B Mastodon @context + Ed25519 HTTP Signature). Dual-homed isolation separates db_net (10.95.1.0/24) from wan_net (10.95.2.0/24) so tc netem, tx_bytes, and CGNAT iptables affect peer traffic only and leave Mongo/Redis unimpaired. The AP baseline omits Ruby/Rails/Sidekiq overhead, which favours AP on CPU and RAM.',
  };

  try {
    // Exchange AP public keys
    const healthA = await (await fetch('http://127.0.0.1:3411/health')).json();
    await fetch('http://127.0.0.1:3412/set-peer-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubKeyPem: healthA.pubKeyPem }),
    });

    // Setup JB certified identity + community on jb-cmp-a and wait for sync to jb-cmp-b
    await runCmd('docker', ['cp', join(HERE, 'lib', 'in-container-pub.cjs'), 'jb-cmp-a:/tmp/in-container-pub.cjs']);
    const jbState = JSON.parse(
      (await runCmd('docker', ['exec', 'jb-cmp-a', 'node', '/tmp/in-container-pub.cjs', 'setup', 'apcmp_user'])).trim(),
    );
    const jbStateB64 = Buffer.from(JSON.stringify(jbState)).toString('base64');
    await waitForJbIds('jagoo_cmp_b', [jbState.certId, jbState.communityEnvelopeId], 30_000);

    // ── 7a: Constrained lossy link (128 kbps, 5% loss, 150ms RTT) on wan_net only ────
    process.stdout.write('\n[7a] Applying 75ms delay + 5% loss + 128kbit/s cap (150ms RTT) on wan_net pairs...\n');
    for (const c of ['jb-cmp-a', 'jb-cmp-b', 'ap-cmp-a', 'ap-cmp-b']) {
      await netemExec(c, ['tc', 'qdisc', 'replace', 'dev', wanIf.get(c), 'root', 'netem', 'delay', '75ms', '15ms', 'loss', '5%', 'rate', '128kbit']);
    }
    await sleep(1000);

    // JB 20 posts
    const jbTxBefore = await readTxBytes('jb-cmp-a', wanIf.get('jb-cmp-a'));
    const jbPosts = JSON.parse(
      (
        await runCmd('docker', [
          'exec',
          'jb-cmp-a',
          'node',
          '/tmp/in-container-pub.cjs',
          'post',
          jbStateB64,
          '20',
          '1500',
          'cmp_lossy',
        ])
      ).trim(),
    );
    const jbIds = jbPosts.map((p) => p.contentId);
    const jbTimesA = await getJbTimes('jagoo_cmp_a', jbIds);
    const jbTimesB = await waitForJbIds('jagoo_cmp_b', jbIds, 60_000);
    const jbTxAfter = await readTxBytes('jb-cmp-a', wanIf.get('jb-cmp-a'));
    const jbLatencies = jbIds
      .map((id) => (jbTimesA[id] !== undefined && jbTimesB[id] !== undefined ? jbTimesB[id] - jbTimesA[id] : null))
      .filter((v) => v !== null);

    // AP 20 posts
    const apTxBefore = await readTxBytes('ap-cmp-a', wanIf.get('ap-cmp-a'));
    const apPublishRows = [];
    for (let i = 0; i < 20; i += 1) {
      const r = await (
        await fetch('http://127.0.0.1:3411/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq: i + 1, text: `Controlled test message cmp_lossy index ${i}` }),
        })
      ).json();
      apPublishRows.push(r);
      if (i + 1 < 20) await sleep(1500);
    }
    const apTxAfter = await readTxBytes('ap-cmp-a', wanIf.get('ap-cmp-a'));
    const apInbox = await (await fetch('http://127.0.0.1:3412/inbox/items')).json();
    const apRecvMap = new Map(apInbox.items.map((it) => [it.id, it.receivedAtMs]));
    const apLatencies = apPublishRows
      .map((r) => {
        const recv = apRecvMap.get(r.id);
        return recv !== undefined ? recv - r.sentAtMs : null;
      })
      .filter((v) => v !== null);

    const stats7a = await sampleDockerStats(['jb-cmp-a', 'jb-cmp-b', 'ap-cmp-a', 'ap-cmp-b']);

    report.constrainedLossy128kbps5PctLoss150msRtt = {
      samples: 20,
      jagooBahee: {
        latencyMs: summarize(jbLatencies, 20),
        txBytesTotal: jbTxAfter - jbTxBefore,
        txBytesPerPost: round3((jbTxAfter - jbTxBefore) / 20),
      },
      activityPubBaseline: {
        latencyMs: summarize(apLatencies, 20),
        txBytesTotal: apTxAfter - apTxBefore,
        txBytesPerPost: round3((apTxAfter - apTxBefore) / 20),
        payloadRawBytes: apPublishRows[0]?.rawBytes ?? null,
        payloadGzipBytes: apPublishRows[0]?.gzipBytes ?? null,
      },
      resources: stats7a,
    };
    process.stdout.write(
      `  7a JB: delivered=${report.constrainedLossy128kbps5PctLoss150msRtt.jagooBahee.latencyMs.delivered}/20 median=${report.constrainedLossy128kbps5PctLoss150msRtt.jagooBahee.latencyMs.median}ms tx/post=${report.constrainedLossy128kbps5PctLoss150msRtt.jagooBahee.txBytesPerPost}B\n`,
    );
    process.stdout.write(
      `  7a AP: delivered=${report.constrainedLossy128kbps5PctLoss150msRtt.activityPubBaseline.latencyMs.delivered}/20 median=${report.constrainedLossy128kbps5PctLoss150msRtt.activityPubBaseline.latencyMs.median}ms tx/post=${report.constrainedLossy128kbps5PctLoss150msRtt.activityPubBaseline.txBytesPerPost}B\n`,
    );

    // Clear tc netem before 7b
    for (const c of ['jb-cmp-a', 'jb-cmp-b', 'ap-cmp-a', 'ap-cmp-b']) {
      await netemExec(c, ['tc', 'qdisc', 'del', 'dev', wanIf.get(c), 'root']).catch(() => '');
    }

    // ── 7b: Asymmetric reachability / CGNAT (drop inbound federation/inbox port on wan_net only) ─
    process.stdout.write('\n[7b] Simulating CGNAT (dropping inbound port 8444 on jb-cmp-b & 3000 on ap-cmp-b on wan_net)...\n');
    await netemExec('jb-cmp-b', ['iptables', '-A', 'INPUT', '-i', wanIf.get('jb-cmp-b'), '-p', 'tcp', '--dport', '8444', '-j', 'DROP']);
    await netemExec('ap-cmp-b', ['iptables', '-A', 'INPUT', '-i', wanIf.get('ap-cmp-b'), '-p', 'tcp', '--dport', '3000', '-j', 'DROP']);
    await sleep(1000);

    // 7b-1: Publish 10 on jb-cmp-a; check steady-state pull on blocked jb-cmp-b (exposes D7)
    const cgnatJbPosts = JSON.parse(
      (
        await runCmd('docker', [
          'exec',
          'jb-cmp-a',
          'node',
          '/tmp/in-container-pub.cjs',
          'post',
          jbStateB64,
          '10',
          '500',
          'cmp_cgnat',
        ])
      ).trim(),
    );
    const cgnatJbIds = cgnatJbPosts.map((p) => p.contentId);
    const cgnatJbTimesA = await getJbTimes('jagoo_cmp_a', cgnatJbIds);
    const cgnatJbTimesB = await waitForJbIds('jagoo_cmp_b', cgnatJbIds, 25_000);
    const cgnatJbLatencies = cgnatJbIds
      .map((id) =>
        cgnatJbTimesA[id] !== undefined && cgnatJbTimesB[id] !== undefined
          ? cgnatJbTimesB[id] - cgnatJbTimesA[id]
          : null,
      )
      .filter((v) => v !== null);

    // Publish 10 concurrently on ap-cmp-a; push-to-inbox cannot traverse dropped inbound port on ap-cmp-b
    const apCgnatResults = await Promise.all(
      Array.from({ length: 10 }, (_, k) =>
        fetch('http://127.0.0.1:3411/publish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq: 100 + k, text: `CGNAT test message ${100 + k}` }),
        }).then((resp) => resp.json()),
      ),
    );
    const apCgnatDelivered = apCgnatResults.filter((r) => r.delivered).length;

    // 7b-2: True FEDERATION_OUTBOUND_ONLY=true CGNAT bidirectional test with jb-cmp-nat
    process.stdout.write('[7b-2] Starting FEDERATION_OUTBOUND_ONLY=true node jb-cmp-nat...\n');
    const natStartMs = Date.now();
    await runCmd('docker', ['compose', '-f', COMPOSE, '--profile', 'cgnat', 'up', '-d', '--wait', 'jb-cmp-nat']);
    const tcpTable = await runCmd('docker', [
      'exec',
      'jb-cmp-nat',
      'node',
      '-e',
      "process.stdout.write(require('fs').readFileSync('/proc/net/tcp','utf8'))",
    ]);
    const listeningPorts = tcpTable
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((cols) => cols.length >= 4 && cols[3] === '0A')
      .map((cols) => parseInt(cols[1].split(':')[1], 16));
    const outboundOnlyVerified = !listeningPorts.includes(8444);

    // Inbound pull via caller-initiated Backfill on connect()
    const natPullTimes = await waitForJbIds('jagoo_cmp_nat', cgnatJbIds, 30_000);
    const natPullCatchUpMs = cgnatJbIds
      .map((id) => (natPullTimes[id] !== undefined ? Math.max(0, natPullTimes[id] - natStartMs) : null))
      .filter((v) => v !== null);

    // Outbound push via caller-initiated Deliver from jb-cmp-nat -> jb-cmp-a
    await runCmd('docker', ['cp', join(HERE, 'lib', 'in-container-pub.cjs'), 'jb-cmp-nat:/tmp/in-container-pub.cjs']);
    const natState = JSON.parse(
      (await runCmd('docker', ['exec', 'jb-cmp-nat', 'node', '/tmp/in-container-pub.cjs', 'setup', 'apcmp_nat'])).trim(),
    );
    const natStateB64 = Buffer.from(JSON.stringify(natState)).toString('base64');
    const natOutPosts = JSON.parse(
      (
        await runCmd('docker', [
          'exec',
          'jb-cmp-nat',
          'node',
          '/tmp/in-container-pub.cjs',
          'post',
          natStateB64,
          '10',
          '500',
          'cmp_nat_out',
        ])
      ).trim(),
    );
    const natOutIds = natOutPosts.map((p) => p.contentId);
    const natOutTimesNat = await getJbTimes('jagoo_cmp_nat', natOutIds);
    const natOutTimesA = await waitForJbIds('jagoo_cmp_a', natOutIds, 30_000);
    const natOutLatencies = natOutIds
      .map((id) =>
        natOutTimesNat[id] !== undefined && natOutTimesA[id] !== undefined
          ? natOutTimesA[id] - natOutTimesNat[id]
          : null,
      )
      .filter((v) => v !== null);

    report.asymmetricCgnatReachability = {
      samples: 10,
      steadyStateBlockedInbound: {
        jagooBaheeSteadyStatePull: summarize(cgnatJbLatencies, 10),
        activityPubInboundPush: {
          attempted: 10,
          delivered: apCgnatDelivered,
          deliveryRate: apCgnatDelivered / 10,
        },
        note:
          'Steady-state CGNAT inbound-blocked pull via periodic ExchangeTreeHeads + Backfill (pullIntervalMs=2000ms) while inbound :8444 on jb-cmp-b (and :3000 on ap-cmp-b) is dropped via iptables.',
      },
      outboundOnlyCgnatNode: {
        outboundOnlyVerified,
        listeningPorts,
        inboundPullViaBackfillFromStartMs: summarize(natPullCatchUpMs, 10),
        outboundPushViaDeliverMs: summarize(natOutLatencies, 10),
      },
    };
    process.stdout.write(
      `  7b-1 steady-state: JB=${report.asymmetricCgnatReachability.steadyStateBlockedInbound.jagooBaheeSteadyStatePull.delivered}/10 | AP=${apCgnatDelivered}/10\n`,
    );
    process.stdout.write(
      `  7b-2 outbound-only (no 8444 listen=${outboundOnlyVerified}): pull=${report.asymmetricCgnatReachability.outboundOnlyCgnatNode.inboundPullViaBackfillFromStartMs.delivered}/10 median=${report.asymmetricCgnatReachability.outboundOnlyCgnatNode.inboundPullViaBackfillFromStartMs.median}ms | push=${report.asymmetricCgnatReachability.outboundOnlyCgnatNode.outboundPushViaDeliverMs.delivered}/10 median=${report.asymmetricCgnatReachability.outboundOnlyCgnatNode.outboundPushViaDeliverMs.median}ms\n`,
    );

    // Best-effort live Mastodon baseline check
    try {
      const apOut = await runCmd('pnpm', ['ap:baseline', '--', '--hosts=mstdn.social,fosstodon.org', '--per-host=40'], {
        timeout: 30_000,
      });
      report.liveMastodonBaseline = { ok: true, outputTail: apOut.slice(-1500) };
    } catch (err) {
      report.liveMastodonBaseline = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  } finally {
    await tryCmd('docker', ['compose', '-f', COMPOSE, '--profile', 'cgnat', 'down', '-v']);
  }

  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '07-ap-e2e-comparison.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
}

void main().catch((err) => {
  process.stderr.write(`ap-e2e-comparison failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
