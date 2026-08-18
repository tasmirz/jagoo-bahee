/**
 * Generate a federation chain of N nodes for the propagation-latency experiment.
 *
 *   pnpm scale:gen 8            # writes ops/scale-compose.generated.yml
 *   JB_DRAIN_MS=250 pnpm scale:gen 8
 *
 * ── Why a CHAIN and not a mesh ──────────────────────────────────────────────────────
 * The quantity we want is propagation latency as a function of HOP COUNT, and a mesh makes
 * hop count ambiguous — every node is one hop from the origin, so the only thing varying is
 * fanout width. A chain makes the independent variable unambiguous: an envelope published at
 * `jb-n0` reaches `jb-n<i>` in exactly `i` hops, because that is the only path there.
 *
 * Peering is BIDIRECTIONAL and both sides are pinned `#TRUSTED`. That is not a shortcut
 * around TOFU: a peer admitted at `PROBATION` accepts classes 0–2 only, and a forum post is
 * BULK, so a chain built on first-contact trust would carry check-ins and silently drop every
 * post — measuring the admission policy rather than the network. Trust is the operator
 * decision here, exactly as `ops/isp-compose.yml` makes it.
 *
 * ── One mongod, one database per node ───────────────────────────────────────────────
 * L-18 requires genuinely independent stores whenever a phase adds a participant, and a
 * separate DATABASE per node satisfies it: no node can read another's collections, and the
 * two-node gate that found ADR-010's origin defect was built exactly this way. What is shared
 * is the mongod PROCESS, which is a deliberate trade — twelve mongods would spend most of the
 * host's memory on storage engines rather than on nodes, and any contention it introduces
 * inflates the latency we report, which is the conservative direction to be wrong in.
 * `ops/isp-compose.yml` keeps separate mongods because there the PARTITION is the subject;
 * here it is hop count, and reachability is uniform.
 *
 * ── The drain interval is the dominant term, so it is explicit ──────────────────────
 * Each hop costs roughly (drain interval / 2) of queueing plus the transfer itself. That is a
 * model the measurement can be checked against rather than a constant to be forgotten, so it
 * is surfaced as `JB_DRAIN_MS` and reported alongside every number.
 */

import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ed25519 } from '@jagoo/sdk/crypto';

/**
 * Walk up to the workspace marker rather than counting `../` from this file (L-13): the
 * output layout differs between `tsx src/...` and `node dist/...`, and a relative hop count
 * that is right for one silently writes to the wrong place under the other.
 */
function workspaceRoot(): string {
  // `__dirname`, not `import.meta.url`: this package compiles to CommonJS, where the latter
  // is a syntax error rather than a portability nicety.
  let dir = __dirname;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not locate pnpm-workspace.yaml above this file');
}

const count = Number(process.argv[2] ?? 8);
const drainMs = Number(process.env.JB_DRAIN_MS ?? 1000);
if (!Number.isInteger(count) || count < 2 || count > 16) {
  throw new Error(
    `node count must be an integer in 2..16 (redis exposes 16 databases); got ${String(process.argv[2])}`,
  );
}

/** Deterministic per-node identity, so a regenerated file names the same keys. */
const seedFor = (i: number): Uint8Array => new Uint8Array(32).fill(0x20 + i);
const b64 = (value: Uint8Array): string => Buffer.from(value).toString('base64');
const keyFor = (i: number): string => b64(ed25519.derivePublicKey(seedFor(i)));
const name = (i: number): string => `jb-n${i}`;

function peersFor(i: number): string {
  const entries: string[] = [];
  // Bidirectional: each node names its neighbours on both sides, so the chain carries traffic
  // in both directions and an envelope published anywhere reaches everywhere.
  for (const j of [i - 1, i + 1]) {
    if (j < 0 || j >= count) continue;
    entries.push(`${keyFor(j)}@GLOBAL=grpc://${name(j)}:8444#TRUSTED`);
  }
  return entries.join(',');
}

const nodes = Array.from(
  { length: count },
  (_unused, i) => `
  ${name(i)}:
    <<: *node
    container_name: ${name(i)}
    networks: [chain]
    # Published, unlike \`isp-compose.yml\`. There the absence of a host route IS the claim
    # being tested; here the subject is hop count under uniform reachability, so driving the
    # chain from the host costs nothing and saves a \`docker exec\` per request.
    ports:
      - '${3200 + i}:3000'
    depends_on:
      mongo-init: { condition: service_completed_successfully }
      redis: { condition: service_healthy }
    environment:
      <<: *node-env
      NODE_NAME: 'n${i}'
      MONGO_URL: 'mongodb://mongo:27017/jagoo_n${i}?replicaSet=rs0'
      REDIS_URL: 'redis://redis:6379/${i}'
      NODE_SIGNING_SEED: '${b64(seedFor(i))}'
      FEDERATION_ENDPOINTS: 'GLOBAL=grpc://${name(i)}:8444'
      FEDERATION_PEERS: '${peersFor(i)}'
    healthcheck: *node-health`,
).join('\n');

const file = `# GENERATED by backend/src/cli/scale-gen.ts — do not edit by hand (L-01).
#
#   pnpm scale:gen ${count}
#   docker compose -f ops/scale-compose.generated.yml up -d --build --wait
#   pnpm scale:measure
#
# A ${count}-node federation chain: jb-n0 <-> jb-n1 <-> ... <-> jb-n${count - 1}.
# An envelope published at jb-n0 reaches jb-n<i> in exactly i hops.
# Drain interval: ${drainMs} ms — each hop costs roughly half that in queueing.

name: jagoo-scale

x-node: &node
  build:
    context: ..
    dockerfile: ops/node.Dockerfile
  environment: &node-env
    NODE_ENV: development
    PORT: '3000'
    FEDERATION_GRPC_LISTEN: '0.0.0.0:8444'
    FEDERATION_DRAIN_INTERVAL_MS: '${drainMs}'
    FEDERATION_GOSSIP_INTERVAL_MS: '15000'
    ADMIN_KEYS: 'ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c'
    AUTH_ACCESS_SECRET: 'ERERERERERERERERERERERERERERERERERERERERERE='
    AUTH_REFRESH_SECRET: 'IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI='
    POW_SECRET: 'MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM='
    BLOB_FILESYSTEM_ROOT: '/tmp/blobs'
    SERVICE_DISCOVERY_PROBE: 'false'
  healthcheck: &node-health
    test:
      - CMD
      - node
      - -e
      - "fetch('http://127.0.0.1:3000/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    interval: 3s
    timeout: 5s
    retries: 60
    start_period: 10s

services:
  mongo:
    image: mongo:7
    container_name: jb-scale-mongo
    command: ['--replSet', 'rs0', '--bind_ip_all', '--quiet']
    networks: [chain]
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "db.adminCommand('ping').ok || quit(1)"]
      interval: 3s
      timeout: 5s
      retries: 30
      start_period: 5s

  mongo-init:
    image: mongo:7
    container_name: jb-scale-mongo-init
    networks: [chain]
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
    container_name: jb-scale-redis
    networks: [chain]
    command: ['redis-server', '--appendonly', 'no']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 3s
      timeout: 3s
      retries: 20
${nodes}

networks:
  chain:
    driver: bridge
`;

const out = join(workspaceRoot(), 'ops', 'scale-compose.generated.yml');
writeFileSync(out, file, 'utf8');
process.stdout.write(
  `wrote ${out}\n  ${count} nodes, chain jb-n0 … jb-n${count - 1}, drain ${drainMs} ms\n`,
);
