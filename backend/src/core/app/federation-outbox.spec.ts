/**
 * FD-06 — one unreachable peer must not stall delivery to a reachable one.
 *
 * This is L-31, and it was found in deployment, not here. The P3 container gate sat at 18/19
 * with the TG-04 crossing failing, and the standing explanation was "the post crosses, just
 * slowly". Measuring the three-envelope dependency chain per hop showed otherwise: the crossing
 * cost 3.2 s before the IX cut and 407.6 s after it, and 406.5 s of that was origin → bridge
 * while bridge → island B stayed at ~1.1 s. During the stall every outbox row sat at
 * `attempts: 0` while overdue by 150 s — work that was never attempted, which is a scheduler
 * failure and not a destination failure.
 *
 * The cause was that `drain()` delivered to peers strictly serially with no deadline on
 * `deliver`. A blackholed peer (a cut link gives no RST, so connects hang rather than failing
 * fast) blocked every later peer in the same pass — including the bridge, whose entire purpose
 * is to route around the partition that caused the stall.
 *
 * A two-node deployment could never surface this: with one peer there is no head of line to
 * block. That is why it survived P2 and the whole in-process suite.
 *
 * Both tests below fail on purpose against the serial implementation — the first hangs until
 * vitest times it out, the second reports `attempted` work that never completed.
 */

import { describe, expect, it } from 'vitest';
import {
  FederationDirection,
  FederationSender,
  PeerTrust,
  type AnnounceOutcome,
  type DeliverOutcome,
  type PeerRecord,
  type PeerSthReport,
  type StreamFilter,
} from '../ports/network.port.js';
import { Plane, Priority, type ParsedEnvelope } from '../domain/envelope.js';
import { FederationOutboxService } from './federation-outbox.js';
import {
  InMemoryFederationLedger,
  InMemoryFederationOutbox,
} from '../../adapters/outbound/in-memory/in-memory-federation.js';
import { InMemoryPeerDirectory } from '../../adapters/outbound/in-memory/in-memory-services.js';
import {
  FixedClock,
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
} from '../../adapters/outbound/in-memory/in-memory-stores.js';

const UNREACHABLE = 'jbs1unreachable';
const REACHABLE = 'jbs1reachable';
const CONTENT_ID = 'jb1test';
const RAW = new Uint8Array([1, 2, 3]);

function peer(serverId: string): PeerRecord {
  return {
    serverId,
    publicKey: new Uint8Array(32),
    endpoints: [],
    trust: PeerTrust.TRUSTED,
    planes: [Plane.FORUM],
    acceptedClasses: [Priority.BULK],
    lastSeenMs: 0,
  };
}

function envelope(contentId: string): ParsedEnvelope {
  return {
    contentId,
    version: 1,
    plane: Plane.FORUM,
    domain: 'jb:post:create:v1',
    authorKey: new Uint8Array(32),
    keyAlg: 1,
    parent: '',
    scope: '',
    createdAtMs: 0,
    nonce: new Uint8Array(0),
    priority: Priority.BULK,
    body: new Uint8Array(0),
    antiAbuse: null,
    signature: new Uint8Array(64),
  } as unknown as ParsedEnvelope;
}

/**
 * The unreachable peer's `deliver` never settles until the test releases it, which is what a
 * blackholed route does — the connect neither succeeds nor is refused.
 */
class HangingSender extends FederationSender {
  readonly delivered: string[] = [];
  private release: (() => void) | null = null;
  readonly hanging = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async deliver(target: PeerRecord, _plane: Plane, envelopes: readonly Uint8Array[]): Promise<DeliverOutcome> {
    if (target.serverId === UNREACHABLE) {
      await this.hanging;
    }
    this.delivered.push(target.serverId);
    return {
      accepted: envelopes.map(() => CONTENT_ID),
      rejected: [],
      backpressureHintMs: 0,
    } as unknown as DeliverOutcome;
  }

  releaseHang(): void {
    this.release?.();
  }

  async announce(): Promise<AnnounceOutcome> {
    throw new Error('not used');
  }
  streamActivities(_p: PeerRecord, _f: StreamFilter, _s: AbortSignal): AsyncIterable<Uint8Array> {
    throw new Error('not used');
  }
  backfill(): AsyncIterable<Uint8Array> {
    throw new Error('not used');
  }
  async exchangeTreeHeads(): Promise<PeerSthReport> {
    throw new Error('not used');
  }
  async exchangeDirectory(): Promise<readonly PeerRecord[]> {
    throw new Error('not used');
  }
}

async function harness(sender: FederationSender, deliverTimeoutMs?: number) {
  const clock = new FixedClock(1_000);
  const peers = new InMemoryPeerDirectory();
  const queue = new InMemoryFederationOutbox();
  const ledger = new InMemoryFederationLedger();
  const projections = new InMemoryProjectionStore();
  const reader = new InMemoryEnvelopeStore(clock);

  // The unreachable peer is registered FIRST, so it also sorts first in the drain's batch
  // map. That is not incidental: insertion order is what decides who blocks whom, and the
  // deployed failure had exactly this ordering.
  await peers.upsert(peer(UNREACHABLE));
  await peers.upsert(peer(REACHABLE));

  const env = envelope(CONTENT_ID);
  await projections.transaction(async (tx) => {
    await reader.put(env, RAW, tx);
  });

  const outbox = new FederationOutboxService({
    outbox: queue,
    peers,
    ledger,
    sender,
    reader,
    projections,
    clock,
    ...(deliverTimeoutMs === undefined ? {} : { deliverTimeoutMs }),
  });

  await outbox.enqueue(env);
  return { outbox, queue, ledger, clock };
}

describe('FederationOutboxService.drain — head-of-line blocking across peers (FD-06, L-31)', () => {
  it('delivers to a reachable peer while another peer is still hanging', async () => {
    const sender = new HangingSender();
    const { outbox } = await harness(sender);

    // Deliberately not awaited: under the serial implementation this promise never settles,
    // because the unreachable peer is first and nothing bounds its `deliver`.
    const draining = outbox.drain();

    // Give the drain a generous number of microtask turns to reach the reachable peer.
    for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      sender.delivered,
      'the reachable peer must not wait behind an unreachable one',
    ).toContain(REACHABLE);

    sender.releaseHang();
    await draining;
  });

  it('bounds a hanging peer with a deadline instead of stalling the pass forever', async () => {
    const sender = new HangingSender();
    const { outbox, queue } = await harness(sender, 25);

    const report = await outbox.drain();

    // The hanging peer is charged one timed-out attempt; the reachable peer is delivered.
    expect(sender.delivered).toContain(REACHABLE);
    expect(report.delivered).toBe(1);
    expect(report.failed).toBe(1);

    // And the timed-out row is left retryable rather than lost.
    const stats = await queue.stats();
    expect(stats.pending).toBe(1);

    sender.releaseHang();
  });

  it('still records the outbound ledger entry for the peer that did succeed (FD-05)', async () => {
    const sender = new HangingSender();
    const { outbox, ledger } = await harness(sender, 25);

    await outbox.drain();

    const entries = await ledger.entriesFor(CONTENT_ID);
    expect(entries.filter((e) => e.direction === FederationDirection.OUT).map((e) => e.peerId)).toEqual([
      REACHABLE,
    ]);

    sender.releaseHang();
  });
});
