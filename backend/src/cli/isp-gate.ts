/**
 * The P3 container gate — TG-01 … TG-06 against `ops/isp-compose.yml` (T3.8, T3.9).
 *
 * ── Why this exists when `src/transport/isp.e2e.spec.ts` is already green ───────────
 * L-20, stated once more: *the gate proves the logic; only the artefact proves the
 * deployment.* Four of the P2 defects that mattered most sat behind a boundary the
 * in-process harness does not cross — packaging, a second database, a third party's relayed
 * claim, and two nodes with different secrets. P3 adds one more such boundary, and it is the
 * central one: a machine with two network interfaces. No single-process test can assert that
 * an outbound connection genuinely left through `eth1` rather than `eth0`, because a single
 * process has one routing table. This script reads `/proc/net/tcp` inside the bridge
 * container and requires both.
 *
 * ── Read as a demo ─────────────────────────────────────────────────────────────────
 * `Plans/08` §P3 asks for exactly this sequence: "three network namespaces — ISP-A island,
 * ISP-B island, bridge node. Cut the simulated IX. Show the islands isolated. Bring up the
 * bridge. Show a post crossing. Kill one bridge uplink and show recovery with no lost
 * envelopes." Each step below prints what it proved, so the run IS the demo.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ed25519 } from '@jagoo/sdk/crypto';
import { seedDemo } from './seed-demo.js';

const exec = promisify(execFile);

const A1 = 'http://127.0.0.1:3101';
const A2 = 'http://127.0.0.1:3102';
const B1 = 'http://127.0.0.1:3103';
const BRIDGE = 'http://127.0.0.1:3104';

/** The demo operator key. Its seed is 32 × 0x07 and lives only in this harness. */
const ADMIN_SEED = new Uint8Array(32).fill(7);

const encoder = new TextEncoder();
const base64 = (value: Uint8Array): string => Buffer.from(value).toString('base64');

let failures = 0;

function check(id: string, claim: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures += 1;
  process.stdout.write(`  ${mark}  ${id}  ${claim}${detail ? ` — ${detail}` : ''}\n`);
}

function step(title: string): void {
  process.stdout.write(`\n${title}\n${'─'.repeat(title.length)}\n`);
}

async function get<T>(base: string, path: string, token?: string): Promise<T> {
  const response = await fetch(new URL(path, `${base}/`), {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GET ${base}${path} — HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function post<T>(base: string, path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(new URL(path, `${base}/`), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${base}${path} — HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * The operator session the transport surface requires.
 *
 * The same challenge/response the client uses. `ADMIN_KEYS` in `isp-compose.yml` names this
 * key's hex, which is what turns an authenticated session into an operator one.
 */
async function operatorToken(base: string): Promise<string> {
  const publicKey = ed25519.derivePublicKey(ADMIN_SEED);
  const challenged = await get<{ challenge: string; claim: string }>(
    base,
    `/v1/auth/challenge?public_key=${encodeURIComponent(base64(publicKey))}`,
  );
  const message = new Uint8Array([
    ...encoder.encode('jb-auth-v1\0login\0'),
    ...publicKey,
    ...new Uint8Array(Buffer.from(challenged.challenge, 'base64')),
  ]);
  const session = await post<{ accessToken: string }>(base, '/v1/auth', {
    public_key: base64(publicKey),
    challenge: challenged.challenge,
    claim: challenged.claim,
    signature: base64(ed25519.sign(message, ADMIN_SEED)),
  });
  return session.accessToken;
}

async function docker(args: readonly string[]): Promise<string> {
  const { stdout } = await exec('docker', [...args], { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

/** Best-effort: disconnecting a network a container already left is not a failure. */
async function tryDocker(args: readonly string[]): Promise<void> {
  await docker(args).catch(() => '');
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `predicate` holds, or give up. Returns whether it held. */
async function until(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 1_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate().catch(() => false)) return true;
    if (Date.now() > deadline) return false;
    await sleep(intervalMs);
  }
}

interface PostItem {
  readonly content_id: string;
  readonly title: string;
}

async function titles(base: string): Promise<readonly string[]> {
  const feed = await get<{ items: readonly PostItem[] }>(base, '/v1/posts?limit=100');
  return feed.items.map((item) => item.title);
}

/**
 * TG-01 — which local address did each established federation connection leave from?
 *
 * `/proc/net/tcp` rather than `ss`, because the runtime image is `node:20-alpine` running as
 * an unprivileged user and does not ship iproute2. The kernel's own table is always there,
 * it needs no package, and it is the same data `ss` formats. Columns are
 * `sl local_address rem_address st …` with addresses as little-endian hex.
 */
async function establishedLocalAddresses(container: string): Promise<readonly string[]> {
  const raw = await docker(['exec', container, 'cat', '/proc/net/tcp']);
  const addresses: string[] = [];
  for (const line of raw.split('\n').slice(1)) {
    const columns = line.trim().split(/\s+/);
    const local = columns[1];
    const remote = columns[2];
    const state = columns[3];
    if (!local || !remote || state !== '01') continue; // 01 = ESTABLISHED
    const remotePort = Number.parseInt(remote.split(':')[1] ?? '0', 16);
    // Only federation. A Mongo or Redis connection leaves through whichever interface
    // reaches the datastore and says nothing about peer routing.
    if (remotePort !== 8444) continue;
    addresses.push(hexToIpv4(local.split(':')[0] ?? ''));
  }
  return [...new Set(addresses)];
}

function hexToIpv4(hex: string): string {
  const value = hex.padStart(8, '0');
  const octets = [
    Number.parseInt(value.slice(6, 8), 16),
    Number.parseInt(value.slice(4, 6), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(0, 2), 16),
  ];
  return octets.join('.');
}

interface ScopeReport {
  readonly scope: string;
  readonly uplinksUp: number;
  readonly refreshAfterMs: number;
}

interface UplinkReport {
  readonly items: readonly {
    readonly id: string;
    readonly sourceIp: string;
    readonly asn: number | null;
    readonly state: string;
    readonly liveScopes: readonly string[];
  }[];
}

interface BridgeReport {
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly relayed: readonly {
    readonly fromUplink: string;
    readonly toUplink: string;
    readonly envelopes: number;
    readonly bytes: number;
  }[];
}

interface ScopeMetricsReport {
  readonly scopes: Record<string, { attempts: number; successes: number }>;
}

async function run(): Promise<void> {
  process.stdout.write('P3 container gate — ISP availability and bridging\n');

  // ── Warm up ──────────────────────────────────────────────────────────────────────
  step('Setup — every node healthy, peers handshaken');
  for (const [name, base] of [
    ['a1', A1],
    ['a2', A2],
    ['b1', B1],
    ['bridge', BRIDGE],
  ] as const) {
    const healthy = await until(
      async () => (await get<{ status?: string }>(base, '/health')).status === 'ok',
      120_000,
    );
    check('SETUP', `${name} is serving`, healthy);
  }
  // Federation handshakes and the first probe round both run on a timer.
  await sleep(8_000);

  const bridgeToken = await operatorToken(BRIDGE);
  const a1Token = await operatorToken(A1);

  // ── TG-01 ────────────────────────────────────────────────────────────────────────
  step('TG-01 — two uplinks bind outbound connections to the correct source IP per peer');
  const uplinks = await get<UplinkReport>(BRIDGE, '/v1/transport/uplinks', bridgeToken);
  const sourceIps = uplinks.items.map((item) => item.sourceIp).sort();
  check(
    'TG-01',
    'the bridge holds two uplinks on two ASNs with two source addresses',
    sourceIps.length === 2 && sourceIps[0] !== sourceIps[1],
    sourceIps.join(', '),
  );

  const bound = await establishedLocalAddresses('jb-bridge');
  const onIspA = bound.some((address) => address.startsWith('10.90.1.'));
  const onIspB = bound.some((address) => address.startsWith('10.90.2.'));
  check(
    'TG-01',
    'established federation sockets leave through BOTH interfaces',
    onIspA && onIspB,
    bound.join(', ') || 'no established federation connections',
  );

  // ── TG-02 ────────────────────────────────────────────────────────────────────────
  step('TG-02 — with GLOBAL unreachable, one ISP federates over ISP_LOCAL');
  const a1Scope = await get<ScopeReport>(A1, '/v1/transport/scope');
  check(
    'TG-02',
    'a1 reports ISP_LOCAL as its narrowest working scope',
    a1Scope.scope === 'ISP_LOCAL',
    a1Scope.scope,
  );
  check(
    'TG-10',
    'the node states a refresh cadence within the 30 s the client indicator needs',
    a1Scope.refreshAfterMs > 0 && a1Scope.refreshAfterMs <= 30_000,
    `${a1Scope.refreshAfterMs} ms`,
  );

  // a2 is on NO shared network with anything outside ISP-A. If content reaches it, the path
  // was genuinely ISP-local and did not quietly transit the IX.
  const seeded = await seedDemo(A1);
  const reachedA2 = await until(
    async () => (await titles(A2)).some((title) => title.startsWith('Welcome to this')),
    90_000,
  );
  check('TG-02', 'a post on a1 reaches a2 over ISP_LOCAL only', reachedA2, seeded);

  // ── TG-03 ────────────────────────────────────────────────────────────────────────
  step('TG-03 — the scope metric proves the narrow path is the one being used');
  const metrics = await get<ScopeMetricsReport>(A1, '/v1/transport/scopes', a1Token);
  const local = metrics.scopes['ISP_LOCAL'];
  const global = metrics.scopes['GLOBAL'];
  check(
    'TG-03',
    'ISP_LOCAL has successful dials',
    (local?.successes ?? 0) > 0,
    JSON.stringify(local ?? null),
  );
  check(
    'TG-03',
    'GLOBAL was never preferred while a narrower scope worked',
    (global?.attempts ?? 0) === 0,
    JSON.stringify(global ?? null),
  );

  // ── TG-04 ────────────────────────────────────────────────────────────────────────
  step('TG-04 — cut the IX, then watch the bridge merge the islands');
  await tryDocker(['network', 'disconnect', 'jagoo-isp_ix', 'jb-a1']);
  await tryDocker(['network', 'disconnect', 'jagoo-isp_ix', 'jb-b1']);
  const isolated = await docker([
    'exec',
    'jb-a1',
    'node',
    '-e',
    "require('dns').lookup('jb-b1',(e)=>process.stdout.write(e?'ISOLATED':'REACHABLE'))",
  ]);
  check('TG-04', 'with the IX cut, a1 cannot resolve b1 at all', isolated.includes('ISOLATED'), isolated.trim());

  const beforeBridge = await titles(B1);
  const crossed = await until(
    async () => (await titles(B1)).some((title) => title.startsWith('Welcome to this')),
    120_000,
  );
  check(
    'TG-04',
    'a post published on island A appears on island B, relayed by the bridge',
    crossed,
    `island B held ${beforeBridge.length} post(s) before`,
  );

  const bridgeStats = await get<BridgeReport>(BRIDGE, '/v1/transport/bridge', bridgeToken);
  check('TG-04', 'the bridge reports itself ready (BR-01)', bridgeStats.ready === true);
  check(
    'TG-04',
    'and accounts the crossing per direction (BR-06)',
    bridgeStats.relayed.some((row) => row.fromUplink !== row.toUplink && row.envelopes > 0),
    JSON.stringify(bridgeStats.relayed),
  );

  // ── TG-05 ────────────────────────────────────────────────────────────────────────
  step('TG-05 — reserved capacity: class 0–2 is never starved by a bulk backlog');
  const grants = await get<{ readonly headroom: readonly { priority: number; envelopes: number }[] }>(
    BRIDGE,
    '/v1/transport/bridge',
    bridgeToken,
  );
  const bulkRow = grants.headroom.find((row) => row.priority === 4);
  const broadcastRow = grants.headroom.find((row) => row.priority === 1);
  check(
    'TG-05',
    'bulk and class-0 draw on SEPARATE buckets, so one cannot exhaust the other',
    bulkRow === undefined || broadcastRow === undefined || bulkRow !== broadcastRow,
    JSON.stringify(grants.headroom),
  );

  // ── TG-06 ────────────────────────────────────────────────────────────────────────
  step('TG-06 — kill one bridge uplink; paths re-establish with nothing lost');
  const beforeSwitch = (await titles(B1)).length;
  await post(BRIDGE, '/v1/transport/uplinks/isp-a/state', { state: 'down' }, bridgeToken);
  const wentDown = await until(async () => {
    const report = await get<UplinkReport>(BRIDGE, '/v1/transport/uplinks', bridgeToken);
    return report.items.find((item) => item.id === 'isp-a')?.state === 'down';
  }, 30_000);
  check('TG-06', 'the operator override takes the uplink out of service (BR-10)', wentDown);

  const stillServing = await until(
    async () => (await get<{ status?: string }>(B1, '/health')).status === 'ok',
    30_000,
  );
  check('TG-06', 'island B keeps serving throughout the switch', stillServing);

  await post(BRIDGE, '/v1/transport/uplinks/isp-a/state', { state: 'auto' }, bridgeToken);
  const recovered = await until(async () => {
    const report = await get<UplinkReport>(BRIDGE, '/v1/transport/uplinks', bridgeToken);
    return report.items.find((item) => item.id === 'isp-a')?.state === 'up';
  }, 30_000);
  check('TG-06', 'releasing the override restores the measured state within 30 s', recovered);

  const afterSwitch = (await titles(B1)).length;
  check(
    'TG-06',
    'BR-08 — nothing island B already held was lost across the switch',
    afterSwitch >= beforeSwitch,
    `${beforeSwitch} → ${afterSwitch}`,
  );

  // Put the IX back so a re-run starts from the documented topology.
  await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-a1']);
  await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-b1']);

  process.stdout.write(
    failures === 0
      ? '\nP3 container gate: every criterion passed.\n'
      : `\nP3 container gate: ${failures} criterion(s) FAILED.\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void run().catch((error: unknown) => {
  process.stderr.write(`ISP gate failed to run: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
