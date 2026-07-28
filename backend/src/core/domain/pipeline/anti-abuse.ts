/**
 * Pipeline step 13 — ANTI-ABUSE.
 *
 * ── The constraint that shapes all of this ──────────────────────────────────────────
 * Every gate here must work against a FULLY ANONYMOUS actor. Requiring identity to stop
 * spam hands the adversary a censorship lever, which in this threat model is worse than the
 * spam it prevents. Cost is the primitive: memory-hard PoW, credits, blind credentials,
 * epoch nullifiers (VIS-07).
 *
 * ── A check-in is free, always ──────────────────────────────────────────────────────
 * `creditCost: 0` domains skip the ledger entirely. Telling people you are alive during a
 * blackout must never fail because a balance ran out — and a zero-cost domain that still
 * consulted the ledger would fail exactly when the ledger was under load, which is exactly
 * when people are checking in.
 *
 * Which gates apply is read from the generated registry row, never branched on the domain.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5, §8
 */

import type { DomainSpec } from '@jagoo/sdk';
import type {
  CreditLedger,
  CredentialIssuer,
  CreditSubject,
  NullifierRegistry,
  PowVerifier,
} from '../../ports/anti-abuse.port.js';
import type { ParsedEnvelope } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';

export interface AntiAbuseDeps {
  readonly credits: CreditLedger;
  readonly nullifiers: NullifierRegistry;
  readonly credentials: CredentialIssuer;
  readonly pow: PowVerifier;
}

/**
 * The subject a cost is charged to.
 *
 * P1-G4 / P1-G5: never the User-Agent, never a raw `X-Forwarded-For` hop. Both are
 * attacker-controlled, so keying a limit on either means rotating a header resets the
 * limit — a rate limiter that the attacker turns off at will.
 */
export function creditSubjectFor(env: ParsedEnvelope): CreditSubject {
  const nullifier = env.antiAbuse?.nullifier;
  if (nullifier && nullifier.length > 0) {
    // Preferred: unlinkable across communities, so charging a cost does not build a
    // cross-community profile of the author.
    return { kind: 'nullifier', value: Buffer.from(nullifier).toString('hex') };
  }
  return { kind: 'key', value: Buffer.from(env.authorKey).toString('hex') };
}

export async function acceptAntiAbuse(
  env: ParsedEnvelope,
  spec: DomainSpec,
  deps: AntiAbuseDeps,
): Promise<void> {
  const gates = spec.requires;

  if (gates.includes('POW')) {
    const proof = env.antiAbuse?.pow;
    if (!proof || proof.length === 0 || !(await deps.pow.verify(env.authorKey, proof))) {
      throw new EnvelopeRejected(
        RejectionCode.INSUFFICIENT_CREDITS,
        'valid proof of work required',
        {
          field: 'anti_abuse.pow',
          challenge: await deps.pow.issue(env.authorKey),
        },
      );
    }
  }

  if (gates.includes('CREDENTIAL')) {
    const credential = env.antiAbuse?.credential;
    if (!credential || credential.length === 0) {
      throw new EnvelopeRejected(
        RejectionCode.CREDENTIAL_INVALID,
        'this domain requires a membership credential',
        { field: 'anti_abuse.credential' },
      );
    }
    if (!(await deps.credentials.verify(credential))) {
      throw new EnvelopeRejected(RejectionCode.CREDENTIAL_INVALID, 'credential is not valid', {
        field: 'anti_abuse.credential',
      });
    }
  }

  if (gates.includes('NULLIFIER')) {
    const nullifier = env.antiAbuse?.nullifier;
    if (!nullifier || nullifier.length === 0) {
      throw new EnvelopeRejected(
        RejectionCode.NULLIFIER_SPENT,
        'this domain requires an epoch nullifier',
        { field: 'anti_abuse.nullifier' },
      );
    }
    const epoch = env.antiAbuse?.epoch ?? 0;
    // One claim per (nullifier, epoch, scope). Spending it twice in an epoch is what the
    // per-epoch quota means — and because the nullifier is derived, not an identity, this
    // limits volume without learning who the author is.
    const claimed = await deps.nullifiers.claim(nullifier, epoch, env.scope);
    if (!claimed) {
      throw new EnvelopeRejected(RejectionCode.NULLIFIER_SPENT, 'epoch quota is exhausted');
    }
  }

  // Free domains never touch the ledger. See the header.
  if (spec.creditCost > 0) {
    const status = await deps.credits.consume(creditSubjectFor(env), spec.creditCost);
    if (!status.allowed) {
      throw new EnvelopeRejected(RejectionCode.INSUFFICIENT_CREDITS, 'insufficient credits', {
        retryAfterMs: Math.max(0, status.resetAtMs),
        challenge: await deps.pow.issue(env.authorKey),
      });
    }
  }
}
