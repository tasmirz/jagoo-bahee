/**
 * Network ports.
 *
 * ── The Liskov rule that matters here ────────────────────────────────────────────────
 * Every `Transport` is substitutable. The outbox drains through HTTP, mesh or Reticulum
 * with IDENTICAL calling code. `if (transport.id === "reticulum")` in application code is
 * a Liskov violation and is banned (NFR-M03, lint-enforced).
 *
 * Reticulum is an optional adapter behind this port and must never be a dependency — the
 * system ships complete with it absent from the build (G-01).
 *
 * ── G-04: the fallback path is the primary path whenever it works ───────────────────
 * `PathSelector` prefers the NARROWEST working scope (LAN > ISP_LOCAL > NATIONAL > GLOBAL)
 * continuously, during normal operation. This is not an optimisation. It means the
 * resilience path is warm and exercised at the moment it becomes the only path. Code that
 * only runs during a blackout is code that fails during a blackout.
 */

import type { ParsedEnvelope, Priority } from '../domain/envelope.js';

export const ReachabilityScope = {
  GLOBAL: 'GLOBAL',
  NATIONAL: 'NATIONAL',
  ISP_LOCAL: 'ISP_LOCAL',
  LAN: 'LAN',
  MESH: 'MESH',
  RETICULUM: 'RETICULUM',
} as const;
export type ReachabilityScope = (typeof ReachabilityScope)[keyof typeof ReachabilityScope];

/** Narrowest first — the preference order G-04 mandates. */
export const SCOPE_PREFERENCE: readonly ReachabilityScope[] = [
  ReachabilityScope.LAN,
  ReachabilityScope.MESH,
  ReachabilityScope.ISP_LOCAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.GLOBAL,
  ReachabilityScope.RETICULUM,
];

export interface PeerEndpoint {
  readonly address: string;
  readonly scope: ReachabilityScope;
  readonly asn?: number;
  readonly isp?: string;
}

export const PeerTrust = {
  /** New peers land here via TOFU and earn reach through vouches (FD-04). */
  PROBATION: 'PROBATION',
  TRUSTED: 'TRUSTED',
  BLOCKED: 'BLOCKED',
} as const;
export type PeerTrust = (typeof PeerTrust)[keyof typeof PeerTrust];

export interface PeerRecord {
  /** jbs1… — identity is the key, never a URL (FD-02). */
  readonly serverId: string;
  readonly publicKey: Uint8Array;
  readonly endpoints: readonly PeerEndpoint[];
  readonly trust: PeerTrust;
  readonly lastSeenMs: number;
}

export interface SelectedPath {
  readonly endpoint: PeerEndpoint;
  readonly transportId: string;
}

export abstract class Transport {
  abstract readonly id: string;
  abstract readonly scopes: readonly ReachabilityScope[];
  /**
   * G-07: a transport declares which priority classes it carries. Reticulum accepts only
   * BROADCAST, DIRECT and CHECKIN and rejects bulk forum traffic with a typed error — a
   * LoRa link cannot carry a forum feed, and attempting it starves the emergency channel.
   */
  abstract readonly classes: readonly Priority[];
  abstract send(raw: Uint8Array, endpoint: PeerEndpoint): Promise<void>;
}

export abstract class PeerDirectory {
  abstract get(serverId: string): Promise<PeerRecord | null>;
  abstract upsert(record: PeerRecord): Promise<void>;
  abstract forScope(scope: ReachabilityScope): Promise<readonly PeerRecord[]>;
  abstract forAsn(asn: number): Promise<readonly PeerRecord[]>;
}

export abstract class PathSelector {
  /** Null when no path works at any scope. */
  abstract select(peer: PeerRecord): Promise<SelectedPath | null>;
}

export interface BackfillReport {
  readonly received: number;
  readonly accepted: number;
  readonly rejected: number;
}

export abstract class FederationOut {
  abstract enqueue(envelope: ParsedEnvelope, targets?: readonly string[]): Promise<void>;
  abstract backfillFrom(peerKey: string, fromIndex: number): Promise<BackfillReport>;
}
