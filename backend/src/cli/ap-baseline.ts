/**
 * ActivityPub wire-size baseline, measured from real federated `Create` activities.
 *
 *   pnpm ap:baseline
 *   pnpm ap:baseline -- --hosts=mstdn.social,fosstodon.org --per-host=40
 *
 * This exists to turn one of our numbers into a comparison. "A forum post encodes to 220 B"
 * is a fact about us and means nothing on its own; "220 B against N B for the same content
 * over the dominant federation protocol" is a result. It is the only quantitative
 * head-to-head this project can honestly make, so the method has to survive a reviewer.
 *
 * ── Where the bytes come from ───────────────────────────────────────────────────────
 * Mastodon serves an actor's `outbox` as ActivityStreams 2.0, and its `orderedItems` are
 * genuine `Create` activities as that server emits them — not a reconstruction, not a
 * client-API projection. We measure those.
 *
 * ── The one adjustment we make, and why it is not a thumb on the scale ──────────────
 * In a collection the `@context` is hoisted to the collection and NOT repeated on each
 * item, but a `Create` POSTed to a remote inbox carries its own `@context`. Measuring the
 * bare outbox item would therefore UNDERSTATE the delivered size. So we re-attach a
 * context — and we do not invent one: we fetch a single status object from the same host
 * with `Accept: application/activity+json`, which returns it standalone WITH the context
 * that host actually uses, and re-attach exactly those bytes. Both figures are reported,
 * so the adjustment is visible rather than baked in.
 *
 * ── Three ways we flatter ActivityPub on purpose ────────────────────────────────────
 * A comparison that only cuts one way invites a reviewer to find the other way for us.
 * All three of these make AP look SMALLER than it is in deployment:
 *
 *  1. AUTHENTICATION IS EXCLUDED. Our 220 B includes a 64 B Ed25519 signature and is
 *     self-authenticating at rest. Mastodon authenticates server-to-server with an HTTP
 *     Signature header, which is transport-level, is not part of the JSON, and is gone the
 *     moment the request ends — a third party cannot verify a stored Mastodon object at
 *     all. We charge AP nothing for this. Adding Linked Data Signatures, which would make
 *     the comparison structurally fair, only widens the gap.
 *  2. NO HTTP FRAMING. Neither side is charged for headers, TLS or connection setup.
 *  3. ONE ACTIVITY PER MEASUREMENT. Real delivery is per-follower fanout; we count the
 *     payload once.
 *
 * ── The headline metric is payload-independent, because content length is a confound ──
 * Our `forum-post-full` fixture carries a 14-character headline. Real Mastodon posts here
 * run from a few characters to a thousand. Comparing totals across that spread would be
 * measuring how much people typed, not how much the protocol costs. So the metric that
 * leads is OVERHEAD = encoded bytes − the UTF-8 bytes of the human-authored text it
 * carries. That is content-independent by construction and is what a protocol designer
 * actually controls. Totals and the raw distribution are reported alongside it.
 *
 * ── What this does NOT establish ────────────────────────────────────────────────────
 * Nothing about throughput, latency or CPU. JSON-LD buys extensibility and semantic
 * interoperation that a fixed protobuf schema does not, and this measures none of that.
 * The claim is narrow and should stay narrow in the paper: on a constrained link, the
 * per-message cost differs by roughly an order of magnitude, and that is the axis that
 * matters when the link is a shared radio.
 */

import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ACCEPT_AS2 =
  'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"';

/** Our own canonical sizes, from tools/vectors/expected.json + 64 B Ed25519. */
const OURS = [
  { name: 'check-in', total: 155, text: '' },
  {
    name: 'Bangla broadcast',
    total: 243,
    text: 'পানি বাড়ছে, জখন৭0 সরে যান',
  },
  { name: 'forum post', total: 220, text: 'Test healdline' },
] as const;

interface Args {
  hosts: string[];
  perHost: number;
}

function parseArgs(argv: string[]): Args {
  let hosts = ['mstdn.social', 'fosstodon.org', 'hachyderm.io'];
  let perHost = 40;
  for (const arg of argv) {
    const hostMatch = /^--hosts=(.+)$/.exec(arg);
    if (hostMatch?.[1]) hosts = hostMatch[1].split(',').map((h) => h.trim()).filter(Boolean);
    const perMatch = /^--per-host=(\d+)$/.exec(arg);
    if (perMatch?.[1]) perHost = Number(perMatch[1]);
  }
  return { hosts, perHost };
}

function workspaceRoot(): string {
  return resolve(__dirname, '..', '..', '..');
}

function utf8 (value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** Mastodon emits compact JSON; measure compact JSON. */
function encoded(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function gzipped(value: unknown): number {
  return gzipSync(Buffer.from(JSON.stringify(value), 'utf8')).length;
}

/**
 * The human-authored text an activity carries. `content` is HTML on the wire, so the tags
 * are protocol overhead, not payload — strip them, and decode the handful of entities
 * Mastodon emits, so the payload figure is the text a person actually typed.
 */
function authoredText(object: Record<string, unknown>): string {
  const html = typeof object.content === 'string' ? object.content : '';
  const summary = typeof object.summary === 'string' ? object.summary : '';
  const stripped = `${summary}${html}`
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return stripped.trim();
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx] ?? 0;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: ACCEPT_AS2, 'User-Agent': 'wire-size-baseline/1.0 (+research)' },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return (await response.json()) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

/** A public actor on the host, discovered from its own public timeline. */
async function discoverActors(host: string, want: number): Promise<string[]> {
  const response = await fetch(`https://${host}/api/v1/timelines/public?limit=40&local=true`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`timeline HTTP ${response.status} on ${host}`);
  const statuses = (await response.json()) as unknown;
  if (!Array.isArray(statuses)) throw new Error(`unexpected timeline shape on ${host}`);
  const actors: string[] = [];
  for (const status of statuses) {
    const record = asRecord(status);
    const account = record ? asRecord(record.account) : undefined;
    const uri = account && typeof account.uri === 'string' ? account.uri : undefined;
    if (uri && uri.startsWith(`https://${host}/`) && !actors.includes(uri)) actors.push(uri);
    if (actors.length >= want) break;
  }
  return actors;
}

interface Sample {
  host: string;
  id: string;
  bareBytes: number;
  deliveredBytes: number;
  deliveredGzip: number;
  textBytes: number;
  overhead: number;
  contextBytes: number;
}

async function collectHost(host: string, perHost: number): Promise<Sample[]> {
  const samples: Sample[] = [];
  const actors = await discoverActors(host, 8);
  if (actors.length === 0) throw new Error(`no local actors discoverable on ${host}`);

  // The context this host actually emits on a standalone object.
  let context: unknown;
  for (const actor of actors) {
    const outboxUrl = `${actor}/outbox?page=true`;
    let page: unknown;
    try {
      page = await getJson(outboxUrl);
    } catch {
      continue;
    }
    const pageRecord = asRecord(page);
    const items = pageRecord && Array.isArray(pageRecord.orderedItems) ? pageRecord.orderedItems : [];
    for (const item of items) {
      const activity = asRecord(item);
      if (!activity || activity.type !== 'Create') continue;
      const object = asRecord(activity.object);
      if (!object || object.type !== 'Note') continue;

      if (context === undefined && typeof object.id === 'string') {
        try {
          const standalone = asRecord(await getJson(object.id));
          if (standalone && standalone['@context'] !== undefined) context = standalone['@context'];
        } catch {
          /* fall through — reported as a bare-only sample set */
        }
      }
      if (context === undefined) continue;

      const delivered = { '@context': context, ...activity };
      const text = authoredText(object);
      const deliveredBytes = encoded(delivered);
      samples.push({
        host,
        id: typeof activity.id === 'string' ? activity.id : '(no id)',
        bareBytes: encoded(activity),
        deliveredBytes,
        deliveredGzip: gzipped(delivered),
        textBytes: utf8(text),
        overhead: deliveredBytes - utf8(text),
        contextBytes: encoded({ '@context': context }) - encoded({}),
      });
      if (samples.length >= perHost) return samples;
    }
  }
  return samples;
}

function stats(values: number[]): { n: number; p50: number; p95: number; min: number; max: number } {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function main(): Promise<void> {
  const { hosts, perHost } = parseArgs(process.argv.slice(2));
  process.stdout.write(`ActivityPub baseline — hosts=${hosts.join(',')} per-host=${perHost}\n\n`);

  const all: Sample[] = [];
  for (const host of hosts) {
    try {
      const samples = await collectHost(host, perHost);
      process.stdout.write(`  ${host}: ${samples.length} Create/Note activities\n`);
      all.push(...samples);
    } catch (error) {
      process.stdout.write(`  ${host}: skipped — ${(error as Error).message}\n`);
    }
  }
  if (all.length === 0) {
    throw new Error('no activities collected; every host refused or served no public outbox');
  }

  const delivered = stats(all.map((s) => s.deliveredBytes));
  const overhead = stats(all.map((s) => s.overhead));
  const gzip = stats(all.map((s) => s.deliveredGzip));
  const text = stats(all.map((s) => s.textBytes));
  const context = stats(all.map((s) => s.contextBytes));

  process.stdout.write(`\nn = ${all.length} real Create activities\n\n`);
  process.stdout.write('metric                          p50      p95      min      max\n');
  process.stdout.write('------------------------------  -------  -------  -------  -------\n');
  const row = (label: string, s: ReturnType<typeof stats>): void => {
    process.stdout.write(
      `${label.padEnd(30)}  ${String(s.p50).padStart(7)}  ${String(s.p95).padStart(7)}  ` +
        `${String(s.min).padStart(7)}  ${String(s.max).padStart(7)}\n`,
    );
  };
  row('delivered bytes (with @context)', delivered);
  row('delivered bytes, gzipped', gzip);
  row('authored text bytes', text);
  row('PROTOCOL OVERHEAD', overhead);
  row('@context declaration alone', context);

  process.stdout.write('\nagainst our canonical envelopes (incl. 64 B Ed25519 signature):\n\n');
  process.stdout.write('envelope           total B   text B   overhead B   AP overhead p50   ratio\n');
  process.stdout.write('-----------------  -------  -------  -----------   ---------------   -----\n');
  for (const ours of OURS) {
    const ourText = utf8(ours.text);
    const ourOverhead = ours.total - ourText;
    const ratio = (overhead.p50 / ourOverhead).toFixed(1);
    process.stdout.write(
      `${ours.name.padEnd(17)}  ${String(ours.total).padStart(7)}  ${String(ourText).padStart(7)}  ` +
        `${String(ourOverhead).padStart(11)}   ${String(overhead.p50).padStart(15)}   ${ratio.padStart(4)}×\n`,
    );
  }

  const outDir = join(workspaceRoot(), 'ops', 'results');
  mkdirSync(outDir, { recursive: true });
  const csv = [
    'host,id,bare_bytes,delivered_bytes,delivered_gzip,text_bytes,overhead_bytes,context_bytes',
    ...all.map(
      (s) =>
        `${s.host},${s.id},${s.bareBytes},${s.deliveredBytes},${s.deliveredGzip},${s.textBytes},${s.overhead},${s.contextBytes}`,
    ),
  ];
  writeFileSync(join(outDir, 'ap-baseline.csv'), `${csv.join('\n')}\n`, 'utf8');
  writeFileSync(
    join(outDir, 'ap-baseline-summary.json'),
    `${JSON.stringify({ n: all.length, hosts, delivered, gzip, text, overhead, context, ours: OURS }, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`\nwrote ops/results/ap-baseline.csv (${all.length} rows)\n`);
  process.stdout.write('wrote ops/results/ap-baseline-summary.json\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`ap baseline failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
