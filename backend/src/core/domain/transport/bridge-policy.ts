/**
 * ISP bridging policy — the L3 rung of the resilience ladder (T3.11, T3.12, BR-01…BR-05).
 *
 * A bridge node is an ordinary federated node with two uplinks and a relay policy. It
 * federates with ISP-A peers over one uplink and ISP-B peers over another, and re-delivers
 * envelopes across. That is the whole mechanism: two islands, merged by a node that sits on
 * both.
 *
 * ── BR-02: a bridge is a VERIFYING relay, not a repeater ────────────────────────────
 * Nothing here decides whether an envelope is valid. By the time this file is consulted the
 * envelope has already run all 19 steps on arrival — FD-03 has no exception for relay, and a
 * bridge that forwarded unverified bytes would be a censorship-resistant way to spread
 * forgeries. This file decides only WHERE an already-accepted envelope goes next.
 *
 * ── BR-04: classes 0–2 have capacity bulk traffic cannot consume ────────────────────
 * The quota is per uplink PAIR and per CLASS. One shared bucket would let a forum backlog
 * exhaust the allowance an emergency broadcast needs, and TG-05 is exactly the assertion that
 * it does not: a class-0 broadcast crosses the bridge while a bulk backlog is queued.
 *
 * ── BR-01: an untrusted node cannot volunteer to become a chokepoint ────────────────
 * Bridging is opt-in per node AND requires `TRUSTED` status with at least one peer on each
 * side. Both halves matter: the opt-in stops a node bridging by accident, and the trust
 * requirement stops a stranger inserting itself between two islands and becoming the only
 * path between them.
 *
 * Pure. Buckets go in and come out; the adapter owns where they live.
 */

import { Priority } from '../envelope.js';
import { consumePair, newBucket, type BucketState } from '../federation/quota.js';

export interface BridgeConfig {
  readonly enabled: boolean;
  /** `relay_between` — each pair is two uplink ids that may exchange traffic. */
  readonly pairs: readonly (readonly [string, string])[];
  readonly classes: readonly Priority[];
  readonly envelopesPerMin: number;
  readonly bytesPerMin: number;
}

export const DISABLED_BRIDGE: BridgeConfig = {
  enabled: false,
  pairs: [],
  classes: [],
  envelopesPerMin: 0,
  bytesPerMin: 0,
};

/**
 * The five refusals `Plans/06` §6 defines, and no more.
 *
 * BR-01's "not TRUSTED on both sides" reports as `disabled` rather than gaining a sixth
 * value: the frozen contract fixes this set, and from the caller's point of view a bridge
 * that has not earned the right to bridge is simply not bridging. The *reason* is not lost —
 * `bridgeReadiness` below reports it, and it is what the operator surface shows (BR-06).
 */
export const RelayRefusal = {
  CLASS_EXCLUDED: 'class_excluded',
  QUOTA: 'quota',
  LOOP: 'loop',
  SAME_ISLAND: 'same_island',
  DISABLED: 'disabled',
} as const;
export type RelayRefusal = (typeof RelayRefusal)[keyof typeof RelayRefusal];

export type RelayDecision =
  | { readonly relay: true; readonly toUplinks: readonly string[] }
  | { readonly relay: false; readonly reason: RelayRefusal };

export interface PairBucket {
  readonly envelopes: BucketState;
  readonly bytes: BucketState;
}

export interface RelayInput {
  readonly config: BridgeConfig;
  /** The uplink the envelope ARRIVED on. BR-03: never relay back out of it. */
  readonly viaUplinkId: string;
  readonly priority: Priority;
  /** Encoded size, so the byte bucket charges what actually crossed the link. */
  readonly bytes: number;
  /** BR-01 — uplink ids that currently have at least one `TRUSTED` peer on them. */
  readonly trustedUplinks: ReadonlySet<string>;
  readonly buckets: ReadonlyMap<string, PairBucket>;
  readonly nowMs: number;
}

export interface RelayOutcome {
  readonly decision: RelayDecision;
  /** Unchanged on refusal — a refused relay must not spend the allowance it was refused. */
  readonly buckets: ReadonlyMap<string, PairBucket>;
}

/**
 * BR-01 — is this node allowed to bridge at all, and if not, why?
 *
 * Separated from `decideRelay` because the answer is a property of the node's configuration
 * and its peers, not of any one envelope, and the operator surface has to explain it without
 * an envelope in hand.
 */
export function bridgeReadiness(
  config: BridgeConfig,
  trustedUplinks: ReadonlySet<string>,
): { readonly ready: boolean; readonly reason?: string } {
  if (!config.enabled) return { ready: false, reason: 'bridging is not enabled' };
  if (config.pairs.length === 0) return { ready: false, reason: 'no uplink pairs configured' };
  for (const [left, right] of config.pairs) {
    if (trustedUplinks.has(left) && trustedUplinks.has(right)) return { ready: true };
  }
  return {
    ready: false,
    // BR-01, stated plainly: an untrusted node cannot volunteer to become a chokepoint.
    reason: 'no uplink pair has a TRUSTED peer on both sides',
  };
}

/**
 * Where an accepted envelope goes next, and what it costs.
 *
 * The decision and the spend happen together. Deciding first and charging later would let
 * two concurrent relays each be told yes against the same remaining allowance, which is the
 * read-modify-write race CLAUDE.md §5.5 bans on every counter in this system.
 */
export function decideRelay(input: RelayInput): RelayOutcome {
  const { config } = input;

  if (!bridgeReadiness(config, input.trustedUplinks).ready) {
    return { decision: { relay: false, reason: RelayRefusal.DISABLED }, buckets: input.buckets };
  }

  if (!config.classes.includes(input.priority)) {
    return {
      decision: { relay: false, reason: RelayRefusal.CLASS_EXCLUDED },
      buckets: input.buckets,
    };
  }

  // BR-03 — the counterpart of every pair this uplink belongs to, and never itself.
  const partners: string[] = [];
  for (const [left, right] of config.pairs) {
    if (left === input.viaUplinkId && right !== input.viaUplinkId) partners.push(right);
    else if (right === input.viaUplinkId && left !== input.viaUplinkId) partners.push(left);
  }

  if (partners.length === 0) {
    // Either this uplink bridges to nothing, or the only pair it appears in names itself.
    const namesItself = config.pairs.some(
      ([left, right]) => left === input.viaUplinkId && right === input.viaUplinkId,
    );
    return {
      decision: {
        relay: false,
        reason: namesItself ? RelayRefusal.LOOP : RelayRefusal.SAME_ISLAND,
      },
      buckets: input.buckets,
    };
  }

  // BR-04 — one bucket per (pair, class). Charged per target, because two islands is two
  // links' worth of bandwidth and charging once would let a three-island bridge relay for
  // free on its third leg.
  const buckets = new Map(input.buckets);
  const accepted: string[] = [];
  for (const partner of unique(partners)) {
    if (!input.trustedUplinks.has(partner) || !input.trustedUplinks.has(input.viaUplinkId)) {
      continue;
    }
    const key = pairKey(input.viaUplinkId, partner, input.priority);
    const current = buckets.get(key) ?? freshBucket(config, input.priority, input.nowMs);
    const verdict = consumePair({
      envelopes: current.envelopes,
      bytes: current.bytes,
      envelopeCost: 1,
      envelopesPerMinute: envelopesPerMinFor(config, input.priority),
      byteCost: input.bytes,
      bytesPerMinute: bytesPerMinFor(config, input.priority),
      nowMs: input.nowMs,
    });
    // The refilled state is kept even on refusal: time passing is not something a refusal
    // should undo, and discarding it would restart the window on every rejected envelope.
    buckets.set(key, { envelopes: verdict.envelopes, bytes: verdict.bytes });
    if (verdict.allowed) accepted.push(partner);
  }

  if (accepted.length === 0) {
    return { decision: { relay: false, reason: RelayRefusal.QUOTA }, buckets };
  }
  return { decision: { relay: true, toUplinks: accepted }, buckets };
}

/**
 * BR-04's reservation, in the same shape `federation/quota.ts` applies per peer.
 *
 * Bulk may use at most half the pair's grant. Classes 0–2 may use all of it, so the half a
 * bulk backlog cannot touch is always there for a broadcast — which is TG-05 stated as
 * arithmetic rather than as a hope.
 */
export function envelopesPerMinFor(config: BridgeConfig, priority: Priority): number {
  if (!config.classes.includes(priority)) return 0;
  return priority === Priority.BULK
    ? Math.floor(config.envelopesPerMin / 2)
    : config.envelopesPerMin;
}

export function bytesPerMinFor(config: BridgeConfig, priority: Priority): number {
  if (!config.classes.includes(priority)) return 0;
  return priority === Priority.BULK ? Math.floor(config.bytesPerMin / 2) : config.bytesPerMin;
}

/** Stable regardless of which side received: a pair is one link, not two. */
export function pairKey(a: string, b: string, priority: Priority): string {
  const [low, high] = a <= b ? [a, b] : [b, a];
  return `${low}::${high}::${priority}`;
}

function freshBucket(config: BridgeConfig, priority: Priority, nowMs: number): PairBucket {
  return {
    envelopes: newBucket(envelopesPerMinFor(config, priority), nowMs),
    bytes: newBucket(bytesPerMinFor(config, priority), nowMs),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/** BR-06 — bytes relayed per direction, per class, plus current headroom. */
export interface BridgeStats {
  readonly ready: boolean;
  readonly reason?: string;
  readonly relayed: readonly {
    readonly fromUplink: string;
    readonly toUplink: string;
    readonly priority: Priority;
    readonly envelopes: number;
    readonly bytes: number;
  }[];
  readonly refused: Readonly<Record<RelayRefusal, number>>;
  readonly headroom: readonly {
    readonly pair: string;
    readonly priority: Priority;
    readonly envelopes: number;
    readonly bytes: number;
  }[];
}
