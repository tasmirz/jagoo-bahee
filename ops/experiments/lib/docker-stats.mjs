/**
 * Capture Docker container CPU / memory / network I/O snapshots.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

function parseBytes(text) {
  const m = /^\s*([\d.]+)\s*([KMGT]?i?B)\s*$/i.exec(text ?? '');
  if (!m) return null;
  const val = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = {
    b: 1,
    kb: 1e3,
    kib: 1024,
    mb: 1e6,
    mib: 1024 ** 2,
    gb: 1e9,
    gib: 1024 ** 3,
    tb: 1e12,
    tib: 1024 ** 4,
  }[unit];
  return mult ? Math.round(val * mult) : null;
}

export async function sampleDockerStats(containers) {
  const { stdout } = await exec('docker', [
    'stats',
    '--no-stream',
    '--format',
    '{{json .}}',
    ...containers,
  ]);
  const out = {};
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    const memUsedText = String(row.MemUsage ?? '').split('/')[0]?.trim() ?? '';
    const memBytes = parseBytes(memUsedText);
    const cpuPct = Number(String(row.CPUPerc ?? '0').replace('%', ''));
    out[row.Name] = {
      cpuPct: Number.isFinite(cpuPct) ? cpuPct : null,
      memUsage: row.MemUsage,
      memMiB: memBytes !== null ? Math.round((memBytes / (1024 * 1024)) * 100) / 100 : null,
      memPerc: row.MemPerc,
      netIO: row.NetIO,
      blockIO: row.BlockIO,
      pids: Number(row.PIDs ?? 0),
    };
  }
  return out;
}
