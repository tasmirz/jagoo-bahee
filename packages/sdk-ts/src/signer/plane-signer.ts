/**
 * The signer boundary.
 *
 * SG-01: no code outside this directory may hold a private key in a variable. Enforced
 * by the lint rule in eslint.config.mjs, which fails any import of `signer/internal/**`
 * from outside `packages/sdk-ts/src/signer/**` and `frontend/src/signer/**`.
 *
 * ── SEP-04, enforced by the type system ─────────────────────────────────────────────
 * `PlaneSigner<Plane.FORUM>` and `PlaneSigner<Plane.SIGNAL>` are not assignable to one
 * another, because `ContextOf<P>` resolves to a different union per plane and the Forum
 * plane carries methods the Signal plane does not have. Passing a Forum signer where a
 * Signal signer is expected is a COMPILE ERROR, not a runtime check (AC-15, AR-08).
 * `plane-separation.spec.ts` asserts this with `@ts-expect-error`.
 *
 * ── A documented weakening on React Native ──────────────────────────────────────────
 * The frozen design (Plans/01 §8) puts each plane's signer in its own Web Worker, so no
 * code path can reach the other plane's key material even if the page is compromised.
 * React Native has no Web Worker equivalent. The mitigation here is nominal typing plus
 * the lint boundary plus secure-store-wrapped material at rest, which is genuinely
 * weaker — an attacker running code inside the app process defeats all three. Accepted
 * for P0–P2 because an RN app is not exposed to arbitrary third-party script injection
 * the way a web page is. MUST be revisited before the Signal plane ships. See
 * ADR-003 §5.
 *
 * Specification: Plans/01-IDENTITY-PLANES.md §8
 */

import type { Plane } from '../core/types.js';

/**
 * What a signature may be made *for*, per plane.
 *
 * The Forum plane has per-community and per-epoch contexts because PA-01 requires that
 * activity in one community is unlinkable to activity in another. The Signal plane has a
 * channel context because recognisability is the entire point there — the opposite goal.
 */
export type ContextOf<P extends Plane> = P extends Plane.FORUM
  ? { kind: 'device' } | { kind: 'community'; communityId: string } | { kind: 'epoch'; epoch: number }
  : P extends Plane.SIGNAL
    ? { kind: 'device' } | { kind: 'channel'; channelId: string }
    : never;

export interface PublicIdentity {
  /** jbk1… — the identity IS this key (VIS-02). */
  readonly id: string;
  readonly publicKey: Uint8Array;
  readonly plane: Plane;
}

export interface BlindState {
  readonly blindingFactor: Uint8Array;
}

export interface Credential {
  readonly bytes: Uint8Array;
}

export interface SessionHandle {
  readonly sessionId: string;
}

/**
 * One interface per plane. Every private-key operation in the system goes through it.
 */
export interface PlaneSigner<P extends Plane> {
  readonly plane: P;

  identity(ctx: ContextOf<P>): Promise<PublicIdentity>;
  sign(ctx: ContextOf<P>, canonicalBytes: Uint8Array): Promise<Uint8Array>;

  /** Hybrid X25519 + ML-KEM-768 (MS-01). */
  agree(peer: PublicIdentity, kemCiphertext?: Uint8Array): Promise<SessionHandle>;

  /**
   * KY-02: a duress revocation MUST be constructible and exportable BEFORE it is needed,
   * and usable by a third party holding only the pre-signed blob. Someone whose device
   * has been seized cannot sign anything.
   */
  prepareDuressRevocation(): Promise<Uint8Array>;

  /**
   * SG-03: wipes ONLY the calling plane's material, so a user can destroy their Forum
   * identity while keeping the Signal identity needed to coordinate relief — or the
   * reverse. CRS-19 requires this to be reachable without unlocking the full app.
   */
  panic(): Promise<void>;
}

/**
 * Forum-plane-only anonymity operations.
 *
 * Absent from the Signal signer's type entirely, which is what makes cross-plane misuse
 * a compile error rather than a runtime branch.
 *
 * PA-02: these signatures are stable so a zk-SNARK Merkle-membership implementation can
 * replace the internals with no protocol change. Full ZKP is an upgrade path, not a
 * dependency — v2 uses blind credentials plus epoch nullifiers.
 */
export interface ForumSigner extends PlaneSigner<Plane.FORUM> {
  /** H(domain ‖ epoch ‖ secret) — enforces "N actions per epoch" without learning who acted. */
  nullifier(epoch: number, scope: string): Promise<Uint8Array>;
  /** Proves "passed the join gate" without revealing which account passed it (AUTH-18). */
  blind(message: Uint8Array): Promise<{ blinded: Uint8Array; state: BlindState }>;
  unblind(state: BlindState, blindSignature: Uint8Array): Promise<Credential>;
}

export type SignalSigner = PlaneSigner<Plane.SIGNAL>;
