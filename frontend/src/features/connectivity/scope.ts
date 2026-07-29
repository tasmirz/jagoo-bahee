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

export interface ScopeStatus {
  readonly scope: ReachabilityScope;
  readonly label: string;
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

export function parseScopeStatus(payload: unknown): ScopeStatus | null {
  const document = payload as Partial<ScopeStatus> | null;
  if (!document || typeof document.scope !== 'string') return null;
  const scope = (
    document.scope in SCOPE_MESSAGE_KEY ? document.scope : 'UNREACHABLE'
  ) as ReachabilityScope;
  return {
    scope,
    label: typeof document.label === 'string' ? document.label : scope,
    uplinksUp: Number(document.uplinksUp ?? 0),
    uplinksTotal: Number(document.uplinksTotal ?? 0),
    bridging: document.bridging === true,
    refreshAfterMs: Number(document.refreshAfterMs ?? MAX_SCOPE_POLL_MS),
    asOfMs: Number(document.asOfMs ?? 0),
  };
}
