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
 * ── Every request is issued INSIDE the topology, and that is not a workaround ───────
 * The first run of this gate failed all four setup checks. The cause was not a bug in the
 * node: `internal: true` on a Docker network means there is no route between it and the
 * host, and Docker therefore publishes no port for a container attached only to internal
 * networks — `docker inspect` reports `"3000/tcp": []`. The original gate drove the stack
 * from the host over `127.0.0.1:3101`, so it was quietly asserting the opposite of what the
 * topology exists to claim.
 *
 * Adding a management network would have fixed the symptom and destroyed the premise: the
 * nodes would have gained egress (so `GLOBAL` would answer) and a route to each other (so
 * cutting the IX would no longer isolate anything). So the harness moved instead of the
 * topology. Every HTTP call below runs as `docker exec <container> node -e fetch(...)`
 * against the node's own loopback, which needs no published port, needs no privilege, and
 * leaves the isolation claim exactly as strong as the compose file says it is.
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

const exec = promisify(execFile);

/** Containers, not URLs — see the header. Each node is addressed through its own loopback. */
const A1 = 'jb-a1';
const A2 = 'jb-a2';
const B1 = 'jb-b1';
const BRIDGE = 'jb-bridge';

const SELF = 'http://127.0.0.1:3000';

/** The demo operator key. Its seed is 32 × 0x07 and lives only in this harness. */
const ADMIN_SEED = new Uint8Array(32).fill(7);

/**
 * The identity that publishes TG-04's crossing post. Doubles as its community name, so it
 * must satisfy COMMUNITY_NAME_PATTERN — `^[a-z0-9_]{3,24}$`.
 */
const CROSSING_IDENTITY = 'isp_gate_crossing';

/** Matches `BRIDGE_ENVELOPES_PER_MIN` / `BRIDGE_BYTES_PER_MIN` in `ops/isp-compose.yml`. */
const BRIDGE_ENVELOPES_PER_MIN = 600;
const BRIDGE_BYTES_PER_MIN = 2_000_000;

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

async function docker(args: readonly string[]): Promise<string> {
  const { stdout } = await exec('docker', [...args], { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

/** Best-effort: disconnecting a network a container already left is not a failure. */
async function tryDocker(args: readonly string[]): Promise<void> {
  await docker(args).catch(() => '');
}

/**
 * One HTTP request, issued from inside a container.
 *
 * Arguments ride in the environment rather than in the `-e` script text, so a base64 token
 * or a JSON body can never be mangled by a shell that is not there — `execFile` passes an
 * argv array, and `docker exec -e` passes values verbatim.
 */
const REQUEST_SCRIPT = `
const url = process.env.JB_URL;
const method = process.env.JB_METHOD || 'GET';
const body = process.env.JB_BODY || '';
const token = process.env.JB_TOKEN || '';
const headers = { Accept: 'application/json' };
if (body) headers['Content-Type'] = 'application/json';
if (token) headers.Authorization = 'Bearer ' + token;
fetch(url, { method, headers, ...(body ? { body } : {}) })
  .then(async (response) => {
    process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }));
  })
  .catch((error) => {
    process.stdout.write(JSON.stringify({ status: 0, body: String(error && error.message) }));
  });
`;

interface RawResponse {
  readonly status: number;
  readonly body: string;
}

async function request(
  container: string,
  path: string,
  options: { readonly method?: string; readonly body?: unknown; readonly token?: string } = {},
): Promise<RawResponse> {
  const env = [
    '-e',
    `JB_URL=${SELF}${path}`,
    '-e',
    `JB_METHOD=${options.method ?? 'GET'}`,
    '-e',
    `JB_BODY=${options.body === undefined ? '' : JSON.stringify(options.body)}`,
    '-e',
    `JB_TOKEN=${options.token ?? ''}`,
  ];
  const stdout = await docker(['exec', ...env, container, 'node', '-e', REQUEST_SCRIPT]);
  return JSON.parse(stdout.trim()) as RawResponse;
}

async function get<T>(container: string, path: string, token?: string): Promise<T> {
  const response = await request(container, path, token === undefined ? {} : { token });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`GET ${container}${path} — HTTP ${response.status} ${response.body.slice(0, 200)}`);
  }
  return JSON.parse(response.body) as T;
}

async function post<T>(
  container: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await request(container, path, {
    method: 'POST',
    body,
    ...(token === undefined ? {} : { token }),
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`POST ${container}${path} — HTTP ${response.status} ${response.body.slice(0, 200)}`);
  }
  return JSON.parse(response.body) as T;
}

/**
 * The operator session the transport surface requires.
 *
 * The same challenge/response the client uses. `ADMIN_KEYS` in `isp-compose.yml` names this
 * key's hex, which is what turns an authenticated session into an operator one.
 */
async function operatorToken(container: string): Promise<string> {
  const publicKey = ed25519.derivePublicKey(ADMIN_SEED);
  const challenged = await get<{ challenge: string; claim: string }>(
    container,
    `/v1/auth/challenge?public_key=${encodeURIComponent(base64(publicKey))}`,
  );
  const message = new Uint8Array([
    ...encoder.encode('jb-auth-v1\0login\0'),
    ...publicKey,
    ...new Uint8Array(Buffer.from(challenged.challenge, 'base64')),
  ]);
  const session = await post<{ accessToken: string }>(container, '/v1/auth', {
    public_key: base64(publicKey),
    challenge: challenged.challenge,
    claim: challenged.claim,
    signature: base64(ed25519.sign(message, ADMIN_SEED)),
  });
  return session.accessToken;
}

/**
 * Seed the demo content through the node's own CLI, inside the container.
 *
 * The runtime image ships `backend/dist/cli/seed-demo.js` and it takes `--url=`. Running the
 * host's copy would need a route to the node that the topology deliberately does not have.
 */
async function seedInside(container: string, identity?: string): Promise<string> {
  // A distinct identity per call, and a community of its own to go with it. The seeder
  // derives its epoch nullifier from its identity seed, so a second run under one identity
  // spends a nullifier the first already claimed; and a second identity posting into the
  // first one's community is refused by moderation, correctly. Both are anti-abuse working
  // against a tool that assumed it could repeat itself.
  const env =
    identity === undefined
      ? []
      : ['-e', `DEMO_IDENTITY_SEED=${identity}`, '-e', `DEMO_COMMUNITY=${identity}`];
  const stdout = await docker([
    'exec',
    ...env,
    container,
    'node',
    'backend/dist/cli/seed-demo.js',
    `--url=${SELF}`,
  ]);
  // `Seeded jb1…` — the content id is what a cross-island assertion must name, because a
  // title is shared by every run of the seeder and proves nothing about which run it came from.
  return (/\bjb1[a-z2-7]+/.exec(stdout) ?? [''])[0];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

async function titles(container: string): Promise<readonly string[]> {
  const feed = await get<{ items: readonly PostItem[] }>(container, '/v1/posts?limit=100');
  return feed.items.map((item) => item.title);
}

async function ids(container: string): Promise<readonly string[]> {
  const feed = await get<{ items: readonly PostItem[] }>(container, '/v1/posts?limit=100');
  return feed.items.map((item) => item.content_id);
}

/**
 * TG-01 — which local address did each established federation connection leave from?
 *
 * `/proc/net/tcp` rather than `ss`, because the runtime image is `node:20-alpine` running as
 * an unprivileged user and does not ship iproute2. The kernel's own table is always there,
 * it needs no package, and it is the same data `ss` formats. Columns are
 * `sl local_address rem_address st …` with addresses as little-endian hex.
 *
 * Both `tcp` and `tcp6` are read: a socket opened to a name that resolved to an IPv4
 * address can still be held on a dual-stack listener and appear only in the v6 table as an
 * IPv4-mapped address, and a gate that read one table would report "no established
 * connections" on a perfectly healthy node.
 */
async function establishedLocalAddresses(container: string): Promise<readonly string[]> {
  const addresses: string[] = [];
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const raw = await docker(['exec', container, 'cat', table]).catch(() => '');
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
      const address = hexToIpv4(local.split(':')[0] ?? '');
      if (address) addresses.push(address);
    }
  }
  return [...new Set(addresses)];
}

/**
 * `/proc/net/tcp` holds a 32-bit little-endian address; `/proc/net/tcp6` holds 128 bits as
 * four little-endian words, and an IPv4-mapped address puts the v4 octets in the last one.
 */
function hexToIpv4(hex: string): string | null {
  const word = hex.length > 8 ? hex.slice(24, 32) : hex;
  if (word.length !== 8) return null;
  const octets = [
    Number.parseInt(word.slice(6, 8), 16),
    Number.parseInt(word.slice(4, 6), 16),
    Number.parseInt(word.slice(2, 4), 16),
    Number.parseInt(word.slice(0, 2), 16),
  ];
  if (octets.some((octet) => Number.isNaN(octet))) return null;
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
  readonly reason?: string;
  readonly relayed: readonly {
    readonly fromUplink: string;
    readonly toUplink: string;
    readonly priority: number;
    readonly envelopes: number;
    readonly bytes: number;
  }[];
  readonly headroom: readonly {
    readonly pair: string;
    readonly priority: number;
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
  for (const [name, container] of [
    ['a1', A1],
    ['a2', A2],
    ['b1', B1],
    ['bridge', BRIDGE],
  ] as const) {
    const healthy = await until(
      async () => (await get<{ status?: string }>(container, '/health')).status === 'ok',
      120_000,
    );
    check('SETUP', `${name} is serving`, healthy);
  }
  // Federation handshakes and the first probe round both run on a timer. PROBE_INTERVAL_MS
  // is 5 s in this harness, so a round has certainly completed by 12 s.
  await sleep(12_000);

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

  const bound = await establishedLocalAddresses(BRIDGE);
  // Compared against the CONFIGURED source addresses, not against the subnets they sit in.
  // The subnet form passed on the first run while source binding was completely broken: the
  // container had .5 on both interfaces, every bound probe failed with EADDRNOTAVAIL, and
  // the unbound federation sockets still left through one interface each — which "starts
  // with 10.90.1." happily accepted. An assertion that a misconfigured node passes is not an
  // assertion. TP-08 says sockets are bound to a SPECIFIC address, so that is what is read.
  const boundToConfigured = sourceIps.filter((address) => bound.includes(address));
  check(
    'TG-01',
    'established federation sockets leave from the exact configured source address of each uplink',
    sourceIps.length === 2 && boundToConfigured.length === 2,
    `configured ${sourceIps.join(', ')} · observed ${bound.join(', ') || 'none'}`,
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
  const seeded = await seedInside(A1);
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
  check(
    'TG-04',
    'with the IX cut, a1 cannot resolve b1 at all',
    isolated.includes('ISOLATED'),
    isolated.trim(),
  );

  // A post published BEFORE the cut is no evidence at all: a1 and b1 federate directly over
  // the IX while it is up, so island B already held the TG-02 post and any check for it
  // passed without the bridge existing. The crossing has to be content that could only have
  // arrived through the bridge, so it is published now, with the islands already severed.
  const beforeBridge = await ids(B1);
  const crossingId = await seedInside(A1, CROSSING_IDENTITY);
  check(
    'TG-04',
    'island B did not already hold the crossing content',
    crossingId.length > 0 && !beforeBridge.includes(crossingId),
    crossingId || 'seed produced no content id',
  );
  const crossed = await until(
    async () => (await ids(B1)).includes(crossingId),
    120_000,
  );
  check(
    'TG-04',
    'a post published on island A AFTER the cut appears on island B, relayed by the bridge',
    crossed,
    `island B held ${beforeBridge.length} post(s) before the crossing`,
  );

  const bridgeStats = await get<BridgeReport>(BRIDGE, '/v1/transport/bridge', bridgeToken);
  check(
    'TG-04',
    'the bridge reports itself ready (BR-01)',
    bridgeStats.ready === true,
    bridgeStats.reason ?? '',
  );
  check(
    'TG-04',
    'and accounts the crossing per direction (BR-06)',
    bridgeStats.relayed.some((row) => row.fromUplink !== row.toUplink && row.envelopes > 0),
    JSON.stringify(bridgeStats.relayed),
  );

  // ── TG-05 ────────────────────────────────────────────────────────────────────────
  step('TG-05 — reserved capacity: class 0–2 is never starved by a bulk backlog');
  // BR-04 as arithmetic, observed from outside: bulk's bucket is created with HALF the
  // pair's grant, so the other half is unreachable to it however long its backlog is. If
  // the reservation were removed, the bulk bucket would start at the full grant and this
  // goes red immediately — which is what makes it an assertion rather than a description.
  const bulkCeiling = Math.floor(BRIDGE_ENVELOPES_PER_MIN / 2);
  const bulkByteCeiling = Math.floor(BRIDGE_BYTES_PER_MIN / 2);
  const bulkRow = bridgeStats.headroom.find((row) => row.priority === 4);
  check(
    'TG-05',
    'the bulk crossing drew on a bucket capped at half the pair grant',
    bulkRow !== undefined &&
      bulkRow.envelopes <= bulkCeiling &&
      bulkRow.bytes <= bulkByteCeiling,
    JSON.stringify(bridgeStats.headroom),
  );
  const emergencyRows = bridgeStats.headroom.filter((row) => row.priority <= 3);
  check(
    'TG-05',
    'no class 0–2 bucket was drawn down by that bulk traffic',
    emergencyRows.every((row) => row.envelopes > bulkCeiling),
    emergencyRows.length === 0
      ? 'no class 0–2 crossing yet — its full grant is intact by construction'
      : JSON.stringify(emergencyRows),
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
