#!/usr/bin/env node
/**
 * Controlled network emulation (tc netem / rate / flapping) across bridged islands.
 * Addresses R1.3 on `ops/isp-compose.yml` with `jagoo-isp_ix` cut.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { summarize } from './lib/stats.mjs';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const NETEM_IMAGE = 'jb-netem:local';
const SAMPLES_PER_SCENARIO = Number(process.env.NETEM_SAMPLES ?? 10);
const PACE_MS = Number(process.env.NETEM_PACE_MS ?? 1500);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function docker(args) {
  const { stdout } = await exec('docker', args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function tryDocker(args) {
  return docker(args).catch(() => '');
}

async function ensureNetemImage() {
  const existing = await tryDocker(['image', 'inspect', NETEM_IMAGE]);
  if (existing.trim()) return;
  process.stdout.write(`Building ${NETEM_IMAGE} from alpine:latest...\n`);
  await docker([
    'run',
    '--name',
    'jb-netem-builder',
    'alpine:latest',
    'sh',
    '-c',
    'apk add --no-cache iproute2 iptables',
  ]);
  try {
    await docker(['commit', 'jb-netem-builder', NETEM_IMAGE]);
  } finally {
    await tryDocker(['rm', '-f', 'jb-netem-builder']);
  }
}

async function detectBridgeInterfaces() {
  const out = await docker([
    'run',
    '--rm',
    '--net=container:jb-bridge',
    NETEM_IMAGE,
    'ip',
    '-o',
    '-4',
    'addr',
    'show',
  ]);
  let ifA = null;
  let ifB = null;
  for (const line of out.split('\n')) {
    const m = /^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)/.exec(line.trim());
    if (!m) continue;
    if (m[2] === '10.90.1.30') ifA = m[1];
    if (m[2] === '10.90.2.30') ifB = m[1];
  }
  if (!ifA || !ifB) {
    throw new Error(`Could not detect bridge interfaces 10.90.1.30 / 10.90.2.30 from:\n${out}`);
  }
  return { ifA, ifB };
}

async function tc(container, args) {
  return docker([
    'run',
    '--rm',
    '--cap-add=NET_ADMIN',
    `--net=container:${container}`,
    NETEM_IMAGE,
    'tc',
    ...args,
  ]);
}

async function clearTc(container, ifaces) {
  for (const iface of ifaces) {
    await tc(container, ['qdisc', 'del', 'dev', iface, 'root']).catch(() => '');
  }
}

async function applyNetem(container, iface, netemArgs) {
  await tc(container, ['qdisc', 'del', 'dev', iface, 'root']).catch(() => '');
  await tc(container, ['qdisc', 'replace', 'dev', iface, 'root', 'handle', '1:', 'prio', 'bands', '3', 'priomap', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']);
  await tc(container, ['qdisc', 'add', 'dev', iface, 'parent', '1:3', 'handle', '30:', 'netem', ...netemArgs]);
  await tc(container, ['filter', 'add', 'dev', iface, 'protocol', 'ip', 'parent', '1:0', 'prio', '1', 'u32', 'match', 'ip', 'protocol', '6', '0xff', 'match', 'ip', 'dport', '8444', '0xffff', 'flowid', '1:3']);
  await tc(container, ['filter', 'add', 'dev', iface, 'protocol', 'ip', 'parent', '1:0', 'prio', '1', 'u32', 'match', 'ip', 'protocol', '6', '0xff', 'match', 'ip', 'sport', '8444', '0xffff', 'flowid', '1:3']);
}

async function getEnvelopesByIds(mongoContainer, dbName, ids) {
  const script = `
    const map = {};
    db.getSiblingDB(${JSON.stringify(dbName)}).envelopes
      .find({ _id: { $in: ${JSON.stringify(ids)} } }, { received_at_ms: 1 })
      .forEach((d) => { map[d._id] = d.received_at_ms; });
    print(JSON.stringify(map));
  `;
  const stdout = await docker(['exec', mongoContainer, 'mongosh', '--quiet', '--eval', script]);
  return JSON.parse(stdout.trim());
}

async function waitForIds(mongoContainer, dbName, ids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let found = {};
  while (Date.now() <= deadline) {
    found = await getEnvelopesByIds(mongoContainer, dbName, ids);
    if (Object.keys(found).length >= ids.length) return found;
    await sleep(500);
  }
  return found;
}

async function run() {
  await ensureNetemImage();
  const { ifA, ifB } = await detectBridgeInterfaces();
  process.stdout.write(`Detected bridge uplinks: isp-a=${ifA}, isp-b=${ifB}\n`);

  // Disconnect IX so all cross-island traffic traverses jb-bridge.
  await tryDocker(['network', 'disconnect', 'jagoo-isp_ix', 'jb-a1']);
  await tryDocker(['network', 'disconnect', 'jagoo-isp_ix', 'jb-b1']);
  const isolated = await docker([
    'exec',
    'jb-a1',
    'node',
    '-e',
    "require('dns').lookup('jb-b1',(e)=>process.stdout.write(e?'ISOLATED':'REACHABLE'))",
  ]);
  if (!isolated.includes('ISOLATED')) {
    throw new Error(`Expected isolated islands after IX cut, got: ${isolated}`);
  }

  await clearTc('jb-bridge', [ifA, ifB]);

  // Stage in-container publisher helper and create one certified identity + community.
  await docker(['cp', join(HERE, 'lib', 'in-container-pub.cjs'), 'jb-a1:/tmp/in-container-pub.cjs']);
  const identity = `netem_${String(Date.now()).slice(-6)}`;
  const setupRaw = await docker([
    'exec',
    'jb-a1',
    'node',
    '/tmp/in-container-pub.cjs',
    'setup',
    identity,
  ]);
  const state = JSON.parse(setupRaw.trim());
  const stateB64 = Buffer.from(JSON.stringify(state)).toString('base64');

  process.stdout.write(`Waiting for cert + community (${identity}) to reach island B...\n`);
  const prereqs = await waitForIds(
    'jb-isp-mongo-b',
    'jagoo_b1',
    [state.certId, state.communityEnvelopeId],
    60_000,
  );
  if (Object.keys(prereqs).length < 2) {
    throw new Error('Prerequisites failed to cross bridge before netem experiments');
  }

  const scenarios = [
    {
      name: 'baseline_clean',
      description: 'No netem impairment on bridged uplinks (0 ms added delay, 0% loss)',
      netemArgs: null,
      waitMs: 30_000,
    },
    {
      name: 'high_rtt_jitter',
      description: '150 ms delay ± 50 ms normal jitter on both bridge uplinks (~300 ms RTT)',
      netemArgs: ['delay', '150ms', '50ms', 'distribution', 'normal'],
      waitMs: 45_000,
    },
    {
      name: 'loss_5pct',
      description: '50 ms ± 15 ms delay + 5% packet loss on both bridge uplinks',
      netemArgs: ['delay', '50ms', '15ms', 'loss', '5%'],
      waitMs: 60_000,
    },
    {
      name: 'loss_10pct',
      description: '75 ms ± 25 ms delay + 10% packet loss on both bridge uplinks',
      netemArgs: ['delay', '75ms', '25ms', 'loss', '10%'],
      waitMs: 75_000,
    },
    {
      name: 'bw_128kbps',
      description: '50 ms ± 10 ms delay + 2% loss + 128 kbit/s rate cap on both bridge uplinks',
      netemArgs: ['delay', '50ms', '10ms', 'loss', '2%', 'rate', '128kbit'],
      waitMs: 75_000,
    },
  ];

  const results = {};

  try {
    for (const sc of scenarios) {
      process.stdout.write(`\nScenario: ${sc.name} — ${sc.description}\n`);
      await clearTc('jb-bridge', [ifA, ifB]);
      if (sc.netemArgs) {
        await applyNetem('jb-bridge', ifA, sc.netemArgs);
        await applyNetem('jb-bridge', ifB, sc.netemArgs);
      }
      await sleep(1500);

      const pubOut = await docker([
        'exec',
        'jb-a1',
        'node',
        '/tmp/in-container-pub.cjs',
        'post',
        stateB64,
        String(SAMPLES_PER_SCENARIO),
        String(PACE_MS),
        sc.name,
      ]);
      const posts = JSON.parse(pubOut.trim());
      const ids = posts.map((p) => p.contentId);
      const mapA = await getEnvelopesByIds('jb-isp-mongo-a', 'jagoo_a1', ids);
      const mapB = await waitForIds('jb-isp-mongo-b', 'jagoo_b1', ids, sc.waitMs);

      const samples = posts.map((p) => {
        const ta = mapA[p.contentId];
        const tb = mapB[p.contentId];
        return {
          contentId: p.contentId,
          latencyMs: ta !== undefined && tb !== undefined ? tb - ta : null,
        };
      });
      const latencies = samples.map((s) => s.latencyMs).filter((v) => v !== null);
      results[sc.name] = {
        description: sc.description,
        netemArgs: sc.netemArgs,
        summary: summarize(latencies, SAMPLES_PER_SCENARIO),
        samples,
      };
      process.stdout.write(
        `  delivered ${results[sc.name].summary.delivered}/${SAMPLES_PER_SCENARIO} median=${results[sc.name].summary.median}ms p95=${results[sc.name].summary.p95}ms\n`,
      );
    }

    // Scenario 6: intermittent_flap — inject posts while alternating 100% loss / clear on isp-b
    process.stdout.write('\nScenario: intermittent_flap — 100% loss 8s / clear 8s x3 cycles, then recover\n');
    await clearTc('jb-bridge', [ifA, ifB]);
    await applyNetem('jb-bridge', ifB, ['loss', '100%']);

    const pubOut = await docker([
      'exec',
      'jb-a1',
      'node',
      '/tmp/in-container-pub.cjs',
      'post',
      stateB64,
      String(SAMPLES_PER_SCENARIO),
      '800',
      'intermittent_flap',
    ]);
    const flapPosts = JSON.parse(pubOut.trim());
    const flapIds = flapPosts.map((p) => p.contentId);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await sleep(8000);
      await clearTc('jb-bridge', [ifB]);
      await sleep(8000);
      if (cycle < 2) {
        await applyNetem('jb-bridge', ifB, ['loss', '100%']);
      }
    }
    await clearTc('jb-bridge', [ifA, ifB]);

    const mapA = await getEnvelopesByIds('jb-isp-mongo-a', 'jagoo_a1', flapIds);
    const mapB = await waitForIds('jb-isp-mongo-b', 'jagoo_b1', flapIds, 90_000);
    const flapSamples = flapPosts.map((p) => {
      const ta = mapA[p.contentId];
      const tb = mapB[p.contentId];
      return {
        contentId: p.contentId,
        latencyMs: ta !== undefined && tb !== undefined ? tb - ta : null,
      };
    });
    const flapLatencies = flapSamples.map((s) => s.latencyMs).filter((v) => v !== null);
    results.intermittent_flap = {
      description: '3 cycles of 8s 100% packet drop / 8s recovery on isp-b bridge uplink, then clean recovery',
      netemArgs: ['flap', '8s_drop_100%', '8s_clear', 'x3'],
      summary: summarize(flapLatencies, SAMPLES_PER_SCENARIO),
      samples: flapSamples,
    };
    process.stdout.write(
      `  delivered ${results.intermittent_flap.summary.delivered}/${SAMPLES_PER_SCENARIO} median=${results.intermittent_flap.summary.median}ms p95=${results.intermittent_flap.summary.p95}ms\n`,
    );
  } finally {
    await clearTc('jb-bridge', [ifA, ifB]);
    await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-a1']);
    await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-b1']);
  }

  const report = {
    recordedAt: new Date().toISOString(),
    samplesPerScenario: SAMPLES_PER_SCENARIO,
    paceMs: PACE_MS,
    bridgeInterfaces: { ispA: ifA, ispB: ifB },
    scenarios: results,
  };
  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '04-netem-emulation.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
}

void run().catch((err) => {
  process.stderr.write(`netem-emulation failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
