/**
 * The baked-in per-ISP seed directory (T3.7, TP-07, TG-09).
 *
 * ── Why an app ships with addresses in it ──────────────────────────────────────────
 * "The application ships a seed directory of known nodes per major ISP, baked into the
 * build. A first-run client during a blackout still has somewhere to try." Every other
 * discovery mechanism needs something to have happened first: the pre-positioned cache needs
 * a previous session, gossip needs a reachable peer, mDNS needs a node on the same segment,
 * QR and word-of-mouth need another person. This list is the only one that works for someone
 * who installs the app after the gateway is already down.
 *
 * ── These are ISP-local addresses on purpose ───────────────────────────────────────
 * A seed list of public hostnames is a seed list that stops working at exactly the moment it
 * is needed, because DNS and the international transit are the first things to go. Each entry
 * therefore carries its scope and its ASN, and the client tries the narrowest first (TP-01).
 *
 * ── Replace these before shipping to real users ────────────────────────────────────
 * The entries below are the documented shape with placeholder addresses from the reserved
 * documentation ranges (RFC 5737). A real build substitutes the addresses of nodes the
 * operators have actually stood up. They are deliberately obvious placeholders rather than
 * plausible-looking ones: a wrong address that looks right is worse than none.
 */

export type SeedScope = 'LAN' | 'ISP_LOCAL' | 'NATIONAL' | 'GLOBAL';

export interface SeedNode {
  /** Free-form label an operator can recognise. Not an identity — the key is (FD-02). */
  readonly label: string;
  readonly address: string;
  readonly scope: SeedScope;
  readonly asn?: number;
  readonly isp?: string;
  readonly region?: string;
}

/**
 * Narrowest first, so `connectFromSeeds` tries an ISP-local address before a national one
 * and a national one before the public internet.
 */
export const SEED_DIRECTORY: readonly SeedNode[] = [
  // ── Grameenphone / GPIT ───────────────────────────────────────────────────────────
  {
    label: 'Dhaka community node (GP)',
    address: 'http://192.0.2.11:3000',
    scope: 'ISP_LOCAL',
    asn: 24_432,
    isp: 'Grameenphone',
    region: 'dhaka',
  },
  // ── Link3 ─────────────────────────────────────────────────────────────────────────
  {
    label: 'Dhaka community node (Link3)',
    address: 'http://192.0.2.21:3000',
    scope: 'ISP_LOCAL',
    asn: 23_688,
    isp: 'Link3',
    region: 'dhaka',
  },
  // ── Amber IT ──────────────────────────────────────────────────────────────────────
  {
    label: 'Chittagong community node (Amber)',
    address: 'http://192.0.2.31:3000',
    scope: 'ISP_LOCAL',
    asn: 45_916,
    isp: 'Amber IT',
    region: 'chittagong',
  },
  // ── BDIX — reachable from any domestic ISP while the exchange is up ───────────────
  {
    label: 'BDIX relay',
    address: 'http://198.51.100.10:3000',
    scope: 'NATIONAL',
    isp: 'BDIX',
  },
  // ── Public internet — the last resort, and the first thing to be blocked ──────────
  {
    label: 'Public relay',
    address: 'https://relay.jagoo-bahee.example',
    scope: 'GLOBAL',
  },
];

const SCOPE_ORDER: Readonly<Record<SeedScope, number>> = {
  LAN: 0,
  ISP_LOCAL: 1,
  NATIONAL: 2,
  GLOBAL: 3,
};

/** TP-01 applied to discovery: try the narrowest scope first, every time. */
export function seedsByPreference(
  seeds: readonly SeedNode[] = SEED_DIRECTORY,
): readonly SeedNode[] {
  return [...seeds].sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]);
}

/** Seeds on one ISP, so a client that knows its ASN can skip straight to its own island. */
export function seedsForAsn(
  asn: number,
  seeds: readonly SeedNode[] = SEED_DIRECTORY,
): readonly SeedNode[] {
  return seedsByPreference(seeds).filter((seed) => seed.asn === asn);
}
