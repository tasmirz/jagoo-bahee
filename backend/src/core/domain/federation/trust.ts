/**
 * The trust model — TOFU plus web-of-trust (`Plans/05` §3).
 *
 * Pure and deterministic: every input, including the current time, is an argument. That is
 * what makes "7 days clean at PROBATION promotes to NORMAL" a unit test rather than a
 * seven-day integration test.
 *
 * ── FD-01, and why there is no allowlist here ───────────────────────────────────────
 * Admin allowlisting MUST NOT be the only path to federate. v1 required an admin to set
 * `federationservers.status === 'approved'`, which is exactly backwards for this threat
 * model: during a shutdown, volunteers stand up relay nodes and cannot wait for manual
 * approval, so the system was least able to grow relays at the moment relays mattered
 * most. New peers therefore land at `PROBATION` on first contact and earn reach through
 * vouches — an admin decision is still honoured, it is simply not a precondition.
 *
 * ── FD-03, restated because it is easy to erode ─────────────────────────────────────
 * Nothing in this file affects verification. Trust decides QUOTA and reach. Every inbound
 * envelope re-runs all 19 pipeline steps regardless of who sent it.
 */

import { Priority } from '../envelope.js';
import { PeerTrust, type PeerQuota, type PeerVouch } from '../../ports/network.port.js';

/** Ascending reach. Index is meaningful only inside this module. */
const ORDER: readonly PeerTrust[] = [
  PeerTrust.BLOCKED,
  PeerTrust.UNSPECIFIED,
  PeerTrust.PROBATION,
  PeerTrust.NORMAL,
  PeerTrust.TRUSTED,
];

export function trustRank(level: PeerTrust): number {
  const index = ORDER.indexOf(level);
  return index < 0 ? 0 : index;
}

export function atLeast(level: PeerTrust, minimum: PeerTrust): boolean {
  return trustRank(level) >= trustRank(minimum);
}

/** One level down, floored at BLOCKED. Used by FD-16 auto-demotion. */
export function demoteOne(level: PeerTrust): PeerTrust {
  const index = ORDER.indexOf(level);
  if (index <= 0) return PeerTrust.BLOCKED;
  const next = ORDER[index - 1];
  return next === PeerTrust.UNSPECIFIED ? PeerTrust.BLOCKED : (next as PeerTrust);
}

/** 7 days at PROBATION with no quota breach promotes to NORMAL (`Plans/05` §3). */
export const PROBATION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** FD-16 — a peer that breaches quota this many times is demoted one level. */
export const QUOTA_BREACH_LIMIT = 3;

export interface TrustInput {
  /** Null on first contact. */
  readonly current: PeerTrust | null;
  /** An explicit operator decision, which overrides every derived rule. */
  readonly adminLevel?: PeerTrust | undefined;
  readonly vouches: readonly PeerVouch[];
  /** The trust WE assign the asserting node. A vouch from an unknown node counts for nothing. */
  readonly asserterTrust: (asserterKey: Uint8Array) => PeerTrust;
  readonly firstSeenMs: number;
  readonly nowMs: number;
  readonly quotaBreaches?: number;
  /**
   * FD-09: set when this peer was blocked for rewriting its log. A fork is not a transient
   * error and must not be vouched away — only an operator lifts it.
   */
  readonly blockedReason?: string | undefined;
}

export interface TrustEvaluation {
  readonly level: PeerTrust;
  /** Shown to the operator. A trust level with no explanation is an unauditable decision. */
  readonly reason: string;
}

const keyOf = (key: Uint8Array): string => {
  let out = '';
  for (const byte of key) out += byte.toString(16).padStart(2, '0');
  return out;
};

/**
 * Count DISTINCT asserters, not vouches.
 *
 * One node emitting three vouches is one opinion. Counting rows instead of asserters
 * would let a single `PROBATION` peer promote itself to `TRUSTED` by repeating itself,
 * which is the cheapest possible attack on a web of trust.
 */
function distinctAsserters(
  vouches: readonly PeerVouch[],
  predicate: (vouch: PeerVouch, asserter: PeerTrust) => boolean,
  asserterTrust: (key: Uint8Array) => PeerTrust,
): number {
  const seen = new Set<string>();
  for (const vouch of vouches) {
    const asserter = asserterTrust(vouch.asserterKey);
    if (predicate(vouch, asserter)) seen.add(keyOf(vouch.asserterKey));
  }
  return seen.size;
}

export function evaluateTrust(input: TrustInput): TrustEvaluation {
  if (input.adminLevel && input.adminLevel !== PeerTrust.UNSPECIFIED) {
    return { level: input.adminLevel, reason: 'operator decision' };
  }

  if (input.blockedReason) {
    return { level: PeerTrust.BLOCKED, reason: input.blockedReason };
  }

  const negative = distinctAsserters(
    input.vouches,
    (vouch, asserter) => vouch.level === PeerTrust.BLOCKED && asserter === PeerTrust.TRUSTED,
    input.asserterTrust,
  );
  if (negative >= 2) {
    return { level: PeerTrust.BLOCKED, reason: `${negative} trusted peers vouched negative` };
  }

  const trusted = distinctAsserters(
    input.vouches,
    (vouch, asserter) => vouch.level === PeerTrust.TRUSTED && asserter === PeerTrust.TRUSTED,
    input.asserterTrust,
  );
  if (trusted >= 3) {
    return { level: PeerTrust.TRUSTED, reason: `${trusted} trusted vouches` };
  }

  const normal = distinctAsserters(
    input.vouches,
    (vouch, asserter) => atLeast(vouch.level, PeerTrust.NORMAL) && atLeast(asserter, PeerTrust.NORMAL),
    input.asserterTrust,
  );
  if (normal >= 2) {
    return { level: PeerTrust.NORMAL, reason: `${normal} vouches from normal-or-better peers` };
  }

  const current = input.current ?? null;
  if (current === null) {
    // TOFU. The peer is admitted, at the lowest useful level, with no human in the loop.
    return { level: PeerTrust.PROBATION, reason: 'first contact (TOFU)' };
  }

  if (
    current === PeerTrust.PROBATION &&
    (input.quotaBreaches ?? 0) === 0 &&
    input.nowMs - input.firstSeenMs >= PROBATION_PERIOD_MS
  ) {
    return { level: PeerTrust.NORMAL, reason: '7 days clean at probation' };
  }

  return { level: current, reason: 'unchanged' };
}

/**
 * FG-09 — which priority classes a peer at this level may push.
 *
 * PROBATION carries classes 0–2 (`BROADCAST`, `DIRECT`, `CHECKIN`) and not class 3
 * (`BULK`). The asymmetry is deliberate and is the whole point of admitting strangers at
 * all: a node nobody has vouched for can still relay an emergency broadcast or a check-in
 * — telling people you are alive must never depend on reputation — but cannot flood the
 * forum backlog of an instance that has no reason to trust it.
 */
export function allowedClasses(level: PeerTrust): readonly Priority[] {
  switch (level) {
    case PeerTrust.TRUSTED:
    case PeerTrust.NORMAL:
      return [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK];
    case PeerTrust.PROBATION:
      return [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN];
    default:
      return [];
  }
}

/** FD-15 — quota is per peer, per class, as a token bucket at ingress. */
export function quotaFor(level: PeerTrust): PeerQuota {
  const classes = allowedClasses(level);
  switch (level) {
    case PeerTrust.TRUSTED:
      return {
        envelopesPerMin: 6000,
        bytesPerMin: 64 * 1024 * 1024,
        maxConcurrentStreams: 8,
        allowedClasses: classes,
      };
    case PeerTrust.NORMAL:
      return {
        envelopesPerMin: 1200,
        bytesPerMin: 16 * 1024 * 1024,
        maxConcurrentStreams: 4,
        allowedClasses: classes,
      };
    case PeerTrust.PROBATION:
      return {
        envelopesPerMin: 120,
        bytesPerMin: 1024 * 1024,
        maxConcurrentStreams: 1,
        allowedClasses: classes,
      };
    default:
      return { envelopesPerMin: 0, bytesPerMin: 0, maxConcurrentStreams: 0, allowedClasses: [] };
  }
}

/** TRUSTED peers are the STH gossip partners (FD-08). */
export function isGossipPartner(level: PeerTrust): boolean {
  return level === PeerTrust.TRUSTED;
}

/**
 * `PeerTrust` as the `jagoo.v1.TrustLevel` number the wire carries.
 *
 * Defined once, here, because it is part of what a `ServerVouch` signature covers: the
 * signer and every verifier must agree on the integer, and two copies of this table that
 * drift by one would silently invalidate every vouch rather than fail loudly.
 */
export const TRUST_LEVEL_WIRE: Readonly<Record<PeerTrust, number>> = {
  [PeerTrust.UNSPECIFIED]: 0,
  [PeerTrust.BLOCKED]: 1,
  [PeerTrust.PROBATION]: 2,
  [PeerTrust.NORMAL]: 3,
  [PeerTrust.TRUSTED]: 4,
};
