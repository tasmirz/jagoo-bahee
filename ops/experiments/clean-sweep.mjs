#!/usr/bin/env node
/**
 * Phase 6 — Clean hop-scaling & drain-interval sweeps with explicit repeat control (L-35).
 * Addresses R1.2, R2.2, and R2.3.
 *
 * Uses pre-built `jb-node:local` image, runs `down -v` + 5s cooldown between configs,
 * paces publications (`--pace=250`) to isolate unloaded propagation path, and verifies
 * host stability via a repeated control configuration (`n=4, drain=500ms`) at start & end.
 */

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { sampleDockerStats } from './lib/docker-stats.mjs';
import { round3, summarize } from './lib/stats.mjs';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const SAMPLES = Number(process.env.SWEEP_SAMPLES ?? 50);
const PACE_MS = Number(process.env.SWEEP_PACE_MS ?? 250);
const COMPOSE_FILE = join(ROOT, 'ops', 'scale-compose.generated.yml');
const SLEEP_BETWEEN_CONFIGS_MS = 5000;
const PEER_SETTLE_MS = 20_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCmd(cmd, args, env = {}) {
  const { stdout } = await exec(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

function linfit(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: null, intercept: null, r2: null };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return { slope: null, intercept: null, r2: null };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  return {
    slope: round3(slope),
    intercept: round3(intercept),
    r2: r2 === null ? null : Math.round(r2 * 10000) / 10000,
  };
}

function patchComposeToLocalImage() {
  const raw = readFileSync(COMPOSE_FILE, 'utf8');
  const patched = raw.replace(
    /x-node:\s*&node\n\s+build:\n\s+context:\s+\.\.\n\s+dockerfile:\s+ops\/node\.Dockerfile/,
    'x-node: &node\n  image: jb-node:local\n  pull_policy: never',
  );
  if (patched === raw) {
    throw new Error('Failed to patch x-node build block in scale-compose.generated.yml');
  }
  writeFileSync(COMPOSE_FILE, patched, 'utf8');
}

function parseRawScaleCsv(nodes) {
  const raw = readFileSync(join(ROOT, 'ops', 'results', 'scale-latency.csv'), 'utf8');
  const byHop = new Map();
  for (let h = 1; h < nodes; h += 1) byHop.set(h, []);
  for (const line of raw.trim().split('\n').slice(1)) {
    if (!line.trim()) continue;
    const [, hopStr, , , latencyStr] = line.split(',');
    const hop = Number(hopStr);
    const lat = Number(latencyStr);
    if (Number.isFinite(hop) && Number.isFinite(lat)) {
      const arr = byHop.get(hop);
      if (arr) arr.push(lat);
    }
  }
  const hops = {};
  let prevMedian = 0;
  for (let h = 1; h < nodes; h += 1) {
    const s = summarize(byHop.get(h) ?? [], SAMPLES);
    const marginal = s.median !== null ? round3(s.median - prevMedian) : null;
    if (s.median !== null) prevMedian = s.median;
    hops[String(h)] = { ...s, marginalMedianMs: marginal };
  }
  return hops;
}

async function runConfig(cfg) {
  process.stdout.write(`\n=== Sweep config: ${cfg.label} (nodes=${cfg.nodes}, drain=${cfg.drainMs}ms) ===\n`);
  await runCmd('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v']).catch(() => '');
  await runCmd('pnpm', ['scale:gen', String(cfg.nodes)], { JB_DRAIN_MS: String(cfg.drainMs) });
  patchComposeToLocalImage();
  await runCmd('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', '--wait']);
  await sleep(PEER_SETTLE_MS);

  await runCmd('pnpm', [
    'scale:measure',
    '--',
    `--nodes=${cfg.nodes}`,
    `--samples=${SAMPLES}`,
    `--pace=${PACE_MS}`,
  ]);

  const hops = parseRawScaleCsv(cfg.nodes);
  let resources = null;
  if (cfg.captureStats) {
    const names = [
      'jb-scale-mongo',
      'jb-scale-redis',
      ...Array.from({ length: cfg.nodes }, (_, i) => `jb-n${i}`),
    ];
    resources = await sampleDockerStats(names);
  }

  await runCmd('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v']).catch(() => '');
  await sleep(SLEEP_BETWEEN_CONFIGS_MS);

  const xs = [];
  const ys = [];
  for (let h = 1; h < cfg.nodes; h += 1) {
    const med = hops[String(h)]?.median;
    if (med !== null && med !== undefined) {
      xs.push(h);
      ys.push(med);
    }
  }
  const fit = linfit(xs, ys);
  const topHop = hops[String(cfg.nodes - 1)];
  process.stdout.write(
    `  lastHop(${cfg.nodes - 1}): delivered=${topHop.delivered}/${SAMPLES} median=${topHop.median}ms iqr=${topHop.iqr}ms slope=${fit.slope}ms/hop R^2=${fit.r2}\n`,
  );

  return {
    ...cfg,
    samples: SAMPLES,
    paceMs: PACE_MS,
    hops,
    linearFit: fit,
    resources,
  };
}

async function main() {
  const configs = [
    { label: 'control_start_n4_d500', sweep: 'control', nodes: 4, drainMs: 500, captureStats: false },
    { label: 'nodecount_n2_d500', sweep: 'nodecount', nodes: 2, drainMs: 500, captureStats: false },
    { label: 'nodecount_n8_d500', sweep: 'nodecount', nodes: 8, drainMs: 500, captureStats: true },
    { label: 'drain_n4_d250', sweep: 'drain', nodes: 4, drainMs: 250, captureStats: false },
    { label: 'drain_n4_d1000', sweep: 'drain', nodes: 4, drainMs: 1000, captureStats: false },
    { label: 'drain_n4_d2000', sweep: 'drain', nodes: 4, drainMs: 2000, captureStats: false },
    { label: 'control_end_n4_d500', sweep: 'control', nodes: 4, drainMs: 500, captureStats: false },
  ];

  const runs = [];
  try {
    for (const cfg of configs) {
      runs.push(await runConfig(cfg));
    }
  } finally {
    await runCmd('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v']).catch(() => '');
  }

  const ctrlStart = runs[0].hops['3'].median;
  const ctrlEnd = runs[runs.length - 1].hops['3'].median;
  const driftRatio =
    ctrlStart && ctrlEnd ? round3(Math.abs(ctrlEnd - ctrlStart) / ctrlStart) : null;

  const drainRuns = [
    runs[3], // d250
    runs[0], // d500 (control start)
    runs[4], // d1000
    runs[5], // d2000
  ];
  const drainFit = linfit(
    drainRuns.map((r) => r.drainMs),
    drainRuns.map((r) => r.hops['3'].median / 3),
  );

  const report = {
    recordedAt: new Date().toISOString(),
    samplesPerConfig: SAMPLES,
    paceMs: PACE_MS,
    repeatControl: {
      startMedianMs: ctrlStart,
      endMedianMs: ctrlEnd,
      relativeDrift: driftRatio,
      withinThreshold50Pct: driftRatio !== null && driftRatio <= 0.5,
    },
    drainIntervalRegression: {
      formula: 'per_hop_ms = slope * drain_ms + intercept_ms (theoretical slope = 0.5)',
      points: drainRuns.map((r) => ({
        drainMs: r.drainMs,
        hop3MedianMs: r.hops['3'].median,
        perHopMs: round3(r.hops['3'].median / 3),
      })),
      fit: drainFit,
    },
    runs,
  };

  const outDir = join(ROOT, 'ops', 'results', 'reviewer-experiments');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, '06-clean-sweep.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  process.stdout.write(`\nWrote ${outPath}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        repeatControl: report.repeatControl,
        drainIntervalRegression: report.drainIntervalRegression,
      },
      null,
      2,
    ) + '\n',
  );
}

void main().catch((err) => {
  process.stderr.write(`clean-sweep failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
