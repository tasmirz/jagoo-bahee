/**
 * The client's view of which network it is on (T3.20, TP-20, TG-10).
 *
 * ── TP-20 makes this a safety property, not a status widget ────────────────────────
 * "The client MUST display which scope it is currently connected on (GLOBAL / NATIONAL /
 * ISP_LOCAL / LAN / MESH), always visible, never buried in settings. People need to know
 * what network they are on." Someone deciding whether to post their location, or whether a
 * relief message will actually leave the building, needs that answer before they act — not
 * after a failure.
 *
 * ── TG-10 requires the indicator to update within 30 s of a change ─────────────────
 * The node states its own probe cadence in `refreshAfterMs`, and the client honours it
 * within a 30-second ceiling. Polling on a guess would let the display be systematically
 * staler than the truth, which is the one thing an always-visible indicator may not be.
 */

export type ReachabilityScope =
  | 'LAN'
  | 'ISP_LOCAL'
  | 'NATIONAL'
  | 'GLOBAL'
  | 'MESH'
  | 'RETICULUM'
  | 'UNREACHABLE';

/** How this device reached the node. `UNKNOWN` when the node could not tell. */
export type LinkScope = 'LAN' | 'ISP_LOCAL' | 'GLOBAL' | 'UNKNOWN';

export type LinkBasis =
  | 'loopback'
  | 'shared-subnet'
  | 'private-range'
  | 'public-address'
  | 'unknown';

export interface ScopeStatus {
  /**
   * The client↔node link — what the pill shows.
   *
   * This is what TP-20 asks for and what "same network" is a claim about. It is measured
   * from the request itself, so unlike `scope` it is never assumed.
   */
  readonly link: LinkScope;
  readonly linkBasis: LinkBasis;
  /** The node's own onward reach. A different fact; shown separately, never as the link. */
  readonly scope: ReachabilityScope;
  readonly label: string;
  /**
   * Whether `scope` was probed or merely declared.
   *
   * The node has always sent this and the client always dropped it, so an assumed scope was
   * rendered with the same confidence as a measured one — on the sentence that tells someone
   * whether their post leaves the building.
   */
  readonly measured: boolean;
  readonly uplinksUp: number;
  readonly uplinksTotal: number;
  readonly bridging: boolean;
  readonly refreshAfterMs: number;
  readonly asOfMs: number;
}

/** TG-10's ceiling. A node asking to be polled less often than this does not get its way. */
export const MAX_SCOPE_POLL_MS = 30_000;
const MIN_SCOPE_POLL_MS = 5_000;

export function scopePollIntervalMs(status: ScopeStatus | null | undefined): number {
  const requested = status?.refreshAfterMs ?? MAX_SCOPE_POLL_MS;
  return Math.min(Math.max(requested, MIN_SCOPE_POLL_MS), MAX_SCOPE_POLL_MS);
}

/**
 * The i18n key for a scope.
 *
 * Keys rather than strings so Bangla is not a translation layer added at the end. The
 * catalogue already carries `reachLan` … `reachReticulum`; this maps the wire value onto it.
 */
export const SCOPE_MESSAGE_KEY = {
  LAN: 'reachLan',
  ISP_LOCAL: 'reachIspLocal',
  NATIONAL: 'reachNational',
  GLOBAL: 'reachGlobal',
  MESH: 'reachMesh',
  RETICULUM: 'reachReticulum',
  UNREACHABLE: 'reachNone',
} as const;

/**
 * How alarming the current scope is.
 *
 * Not a quality ranking. `LAN` is the NARROWEST scope and the one TP-01 prefers, but for a
 * person it means "nothing you post leaves this building", which is exactly what they need
 * told. `GLOBAL` is the widest reach and the least resilient. So the tone reflects what a
 * user can DO, while the selector's preference reflects what survives — the two orderings
 * genuinely differ and conflating them would produce a UI that calls the resilient state a
 * failure.
 */
export function scopeTone(scope: ReachabilityScope): 'ok' | 'limited' | 'critical' {
  switch (scope) {
    case 'GLOBAL':
    case 'NATIONAL':
      return 'ok';
    case 'ISP_LOCAL':
    case 'MESH':
    case 'RETICULUM':
      return 'limited';
    case 'LAN':
    case 'UNREACHABLE':
    default:
      return 'critical';
  }
}

/** One short sentence saying what this scope means for what the person is about to do. */
export const SCOPE_CONSEQUENCE_KEY = {
  LAN: 'scopeLanBody',
  ISP_LOCAL: 'scopeIspBody',
  NATIONAL: 'scopeNationalBody',
  GLOBAL: 'scopeGlobalBody',
  MESH: 'scopeMeshBody',
  RETICULUM: 'scopeReticulumBody',
  UNREACHABLE: 'scopeNoneBody',
} as const;

const LINK_SCOPES: readonly LinkScope[] = ['LAN', 'ISP_LOCAL', 'GLOBAL', 'UNKNOWN'];
const LINK_BASES: readonly LinkBasis[] = [
  'loopback',
  'shared-subnet',
  'private-range',
  'public-address',
  'unknown',
];

/**
 * The i18n key describing the link, and what it means for what you are about to do.
 *
 * Deliberately separate from `SCOPE_*`: those describe the node's onward reach. Reusing
 * them here is how "the node's uplink declares LAN" turned into "you are on the same
 * network" for a phone on the other side of the internet.
 */
export const LINK_MESSAGE_KEY = {
  LAN: 'linkLan',
  ISP_LOCAL: 'linkNearby',
  GLOBAL: 'linkInternet',
  UNKNOWN: 'linkUnknown',
} as const;

export const LINK_CONSEQUENCE_KEY = {
  LAN: 'linkLanBody',
  ISP_LOCAL: 'linkNearbyBody',
  GLOBAL: 'linkInternetBody',
  UNKNOWN: 'linkUnknownBody',
} as const;

/**
 * How alarming the link is.
 *
 * A LAN link is the narrow, contained case — the same reasoning as `scopeTone`: it is the
 * most resilient and the least far-reaching, and the person needs telling.
 */
export function linkTone(link: LinkScope): 'ok' | 'limited' | 'critical' {
  switch (link) {
    case 'GLOBAL':
      return 'ok';
    case 'ISP_LOCAL':
    case 'UNKNOWN':
      return 'limited';
    case 'LAN':
    default:
      return 'critical';
  }
}

export function parseScopeStatus(payload: unknown): ScopeStatus | null {
  const document = payload as Partial<ScopeStatus> | null;
  if (!document || typeof document.scope !== 'string') return null;
  const scope = (
    document.scope in SCOPE_MESSAGE_KEY ? document.scope : 'UNREACHABLE'
  ) as ReachabilityScope;
  // A node too old to report a link cannot have its answer inferred from `scope`, so it
  // reads UNKNOWN. Saying "we cannot tell" is the only honest degradation here — guessing
  // from the node's uplinks is the exact defect this field exists to remove.
  const link = LINK_SCOPES.includes(document.link as LinkScope)
    ? (document.link as LinkScope)
    : 'UNKNOWN';
  return {
    link,
    linkBasis: LINK_BASES.includes(document.linkBasis as LinkBasis)
      ? (document.linkBasis as LinkBasis)
      : 'unknown',
    scope,
    label: typeof document.label === 'string' ? document.label : scope,
    measured: document.measured === true,
    uplinksUp: Number(document.uplinksUp ?? 0),
    uplinksTotal: Number(document.uplinksTotal ?? 0),
    bridging: document.bridging === true,
    refreshAfterMs: Number(document.refreshAfterMs ?? MAX_SCOPE_POLL_MS),
    asOfMs: Number(document.asOfMs ?? 0),
  };
}
