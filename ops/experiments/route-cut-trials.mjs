#!/usr/bin/env node
/**
 * Repeated route-cut trials (N=20 IX intact + N=20 IX cut / bridged) + resource stats.
 * Addresses R1.2, R2.2, and R2.3 on the live `ops/isp-compose.yml` topology.
 *
 * Uses `envelopes.received_at_ms` inside MongoDB (same clock on single host) so
 * latencies are exact propagation deltas rather than 1,000 ms polling upper bounds.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { decodeSignedEnvelope } from '../../packages/sdk-ts/dist/esm/core/index.js';
import { ed25519 } from '../../packages/sdk-ts/dist/esm/crypto/index.js';
import { sampleDockerStats } from './lib/docker-stats.mjs';
import { summarize } from './lib/stats.mjs';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const N_TRIALS = Number(process.env.RC_TRIALS ?? 20);
const PACE_MS = Number(process.env.RC_PACE_MS ?? 2500);
const WAIT_TIMEOUT_MS = 60_000;

const CONTAINERS = [
  'jb-a1',
  'jb-a2',
  'jb-b1',
  'jb-bridge',
  'jb-isp-mongo-a',
  'jb-isp-redis-a',
  'jb-isp-mongo-b',
  'jb-isp-redis-b',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function docker(args) {
  const { stdout } = await exec('docker', args, { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function tryDocker(args) {
  return docker(args).catch(() => '');
}

async function queryEnvelopesSince(mongoContainer, dbName, sinceMs) {
  const script = `
    const rows = db.getSiblingDB(${JSON.stringify(dbName)}).envelopes
      .find({ received_at_ms: { $gte: ${sinceMs} } }, { received_at_ms: 1, raw: 1 })
      .toArray()
      .map((d) => ({ id: d._id, t: d.received_at_ms, b64: d.raw.toString('base64') }));
    print(JSON.stringify(rows));
  `;
  const stdout = await docker(['exec', mongoContainer, 'mongosh', '--quiet', '--eval', script]);
  return JSON.parse(stdout.trim());
}

async function hasEnvelope(mongoContainer, dbName, contentId) {
  const script = `print(db.getSiblingDB(${JSON.stringify(dbName)}).envelopes.countDocuments({ _id: ${JSON.stringify(contentId)} }));`;
  const stdout = await docker(['exec', mongoContainer, 'mongosh', '--quiet', '--eval', script]);
  return Number(stdout.trim()) > 0;
}

function deriveKeyHex(identity) {
  const seed = new Uint8Array(createHash('sha256').update(identity, 'utf8').digest());
  return Buffer.from(ed25519.derivePublicKey(seed)).toString('hex');
}

function indexByDomainForAuthor(rows, targetAuthorHex) {
  const map = {};
  for (const row of rows) {
    const env = decodeSignedEnvelope(Buffer.from(row.b64, 'base64'));
    if (Buffer.from(env.author_key).toString('hex') !== targetAuthorHex) continue;
    map[env.domain] = { id: row.id, receivedAtMs: row.t };
  }
  return map;
}

async function runSingleTrial(identity) {
  const startedAt = Date.now() - 1000;
  const authorHex = deriveKeyHex(identity);
  const stdout = await docker([
    'exec',
    '-e',
    `DEMO_IDENTITY_SEED=${identity}`,
    '-e',
    `DEMO_COMMUNITY=${identity}`,
    'jb-a1',
    'node',
    'backend/dist/cli/seed-demo.js',
    '--url=http://127.0.0.1:3000',
  ]);
  const match = /\bjb1[a-z2-7]+/.exec(stdout);
  if (!match) throw new Error(`seed-demo produced no content_id for ${identity}: ${stdout}`);
  const postId = match[0];

  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  let reached = false;
  while (Date.now() <= deadline) {
    if (await hasEnvelope('jb-isp-mongo-b', 'jagoo_b1', postId)) {
      reached = true;
      break;
    }
    await sleep(250);
  }

  const rowsA = await queryEnvelopesSince('jb-isp-mongo-a', 'jagoo_a1', startedAt);
  const rowsB = await queryEnvelopesSince('jb-isp-mongo-b', 'jagoo_b1', startedAt);
  const byDomA = indexByDomainForAuthor(rowsA, authorHex);
  const byDomB = indexByDomainForAuthor(rowsB, authorHex);

  const certA = byDomA['jb:key:certify:forum:v1']?.receivedAtMs;
  const commA = byDomA['jb:community:create:v1']?.receivedAtMs;
  const postA = byDomA['jb:post:create:v1']?.receivedAtMs;
  const certB = byDomB['jb:key:certify:forum:v1']?.receivedAtMs;
  const commB = byDomB['jb:community:create:v1']?.receivedAtMs;
  const postB = byDomB['jb:post:create:v1']?.receivedAtMs;

  return {
    identity,
    postId,
    reached,
    certificateMs: certA !== undefined && certB !== undefined ? certB - certA : null,
    communityMs: commA !== undefined && commB !== undefined ? commB - commA : null,
    postMs: postA !== undefined && postB !== undefined ? postB - postA : null,
    chainSpanMs: certA !== undefined && postB !== undefined ? postB - certA : null,
  };
}

function summarizeRegime(trials) {
  const certs = trials.map((t) => t.certificateMs).filter((v) => v !== null);
  const comms = trials.map((t) => t.communityMs).filter((v) => v !== null);
  const posts = trials.map((t) => t.postMs).filter((v) => v !== null);
  const spans = trials.map((t) => t.chainSpanMs).filter((v) => v !== null);
  return {
    certificateMs: summarize(certs, trials.length),
    communityMs: summarize(comms, trials.length),
    postMs: summarize(posts, trials.length),
    chainSpanMs: summarize(spans, trials.length),
  };
}

async function main() {
  // Ensure clean IX state before intact trials
  await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-a1']);
  await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-b1']);
  await sleep(3000);

  const idleStats = await sampleDockerStats(CONTAINERS);
  const tag = String(Date.now()).slice(-6);
  const intactTrials = [];
  const cutTrials = [];
  let activeStats = null;

  try {
    process.stdout.write(`Running ${N_TRIALS} IX-intact trials...\n`);
    for (let i = 0; i < N_TRIALS; i += 1) {
      const id = `ri_${tag}_${String(i).padStart(2, '0')}`;
      const res = await runSingleTrial(id);
      intactTrials.push(res);
      process.stdout.write(
        `  intact ${i + 1}/${N_TRIALS}: cert=${res.certificateMs}ms comm=${res.communityMs}ms post=${res.postMs}ms\n`,
      );
      if (i + 1 < N_TRIALS) await sleep(PACE_MS);
    }

    process.stdout.write('\nDisconnecting jagoo-isp_ix from jb-a1 and jb-b1...\n');
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
      throw new Error(`Expected ISOLATED DNS after IX cut, got: ${isolated}`);
    }
    await sleep(3000);

    process.stdout.write(`Running ${N_TRIALS} IX-cut (bridged) trials...\n`);
    for (let i = 0; i < N_TRIALS; i += 1) {
      const id = `rc_${tag}_${String(i).padStart(2, '0')}`;
      const res = await runSingleTrial(id);
      cutTrials.push(res);
      if (i === Math.floor(N_TRIALS / 2)) {
        activeStats = await sampleDockerStats(CONTAINERS);
      }
      process.stdout.write(
        `  bridged ${i + 1}/${N_TRIALS}: cert=${res.certificateMs}ms comm=${res.communityMs}ms post=${res.postMs}ms\n`,
      );
      if (i + 1 < N_TRIALS) await sleep(PACE_MS);
    }
  } finally {
    await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-a1']);
    await tryDocker(['network', 'connect', 'jagoo-isp_ix', 'jb-b1']);
  }

  const report = {
    recordedAt: new Date().toISOString(),
    trialsPerRegime: N_TRIALS,
    paceMs: PACE_MS,
    measurementNote:
      'Latencies are exact jagoo_b1.envelopes.received_at_ms minus jagoo_a1.envelopes.received_at_ms deltas (same host clock). chainSpanMs = post_b1 - cert_a1.',
    intact: {
      summary: summarizeRegime(intactTrials),
      trials: intactTrials,
    },
    bridgedCut: {
      summary: summarizeRegime(cutTrials),
      trials: cutTrials,
    },
    resources: {
      idle: idleStats,
      activeDuringCutTrials: activeStats,
    },
  };

  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '03-route-cut-trials.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
  process.stdout.write(
    JSON.stringify({ intact: report.intact.summary, bridgedCut: report.bridgedCut.summary }, null, 2) + '\n',
  );
}

void main().catch((err) => {
  process.stderr.write(`route-cut-trials failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
