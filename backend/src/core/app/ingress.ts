/**
 * T1.2 — the 19-step validation pipeline, composed.
 *
 * ── This file COMPOSES; it does not implement ───────────────────────────────────────
 * Every step is a pure function or a port call defined elsewhere (VP-03). This class puts
 * them in the normative order from `Plans/02` §5 and does nothing else. If a step's logic
 * starts leaking in here, it has stopped being independently testable — which is the whole
 * reason the pipeline is not one long procedure.
 *
 * ── There is no branch on `domain` anywhere below ───────────────────────────────────
 * The registry supplies both the policy row and the handler. Adding a content type adds a
 * row and a handler and changes nothing here — that is P1-G11, and it is lint-enforced
 * (AR-05).
 *
 * ── Two invariants this ordering exists to protect ──────────────────────────────────
 * VP-01: steps 1–12 perform NO database writes, so a flood of invalid envelopes cannot be
 *        amplified into write load. The cheap, purely-computational checks run first.
 * VP-02: steps 16 and 17 are atomic with respect to each other. A projected envelope
 *        missing from the Merkle log is a transparency failure, so they share one
 *        transaction and roll back together.
 *
 * Every transport — HTTP, gRPC federation, mesh, Reticulum — runs this same pipeline.
 * Peer trust affects quota only, never verification (FD-04).
 */

import type { ParsedEnvelope } from '../domain/envelope.js';
import type { Tx } from '../domain/domain-handler.js';
import { EnvelopeRejected, RejectionCode } from '../domain/errors.js';
import type { DomainRegistry } from '../domain/domain-registry.js';
import { acceptDomain, acceptPlane, acceptVersion } from '../domain/accept.js';
import { parseEnvelope } from '../domain/pipeline/parse.js';
import {
  acceptAlgPolicy,
  acceptDomainSize,
  acceptPriority,
  acceptSize,
} from '../domain/pipeline/policy.js';
import {
  acceptClock,
  type ClockWindow,
  DEFAULT_CLOCK_WINDOW,
} from '../domain/pipeline/clock-window.js';
import { acceptCertificate, acceptSignature } from '../domain/pipeline/signature.js';
import { acceptDedupe, acceptReplay } from '../domain/pipeline/dedupe.js';
import { acceptAntiAbuse, type AntiAbuseDeps } from '../domain/pipeline/anti-abuse.js';
import { receiptSigningBytes, type Receipt } from '../domain/receipt.js';
import {
  DuplicateContentError,
  type EnvelopeReader,
  type EnvelopeWriter,
  type ProjectionStore,
} from '../ports/storage.port.js';
import type { CertificateStore, SignatureVerifier } from '../ports/identity.port.js';
import type { WitnessLog } from '../ports/transparency.port.js';
import type { FederationOut } from '../ports/network.port.js';
import type { NodeSigner } from '../ports/node-signer.port.js';
import type { Clock } from '../ports/system.port.js';
import type { EventBus } from '../ports/events.port.js';
import type { TaggedCache } from '../ports/cache.port.js';

export interface NonceStore {
  seen(authorKey: Uint8Array, nonce: Uint8Array): Promise<boolean>;
  reserve(authorKey: Uint8Array, nonce: Uint8Array, tx: Tx): Promise<boolean>;
}

export interface IngressDeps {
  readonly registry: DomainRegistry;
  readonly reader: EnvelopeReader;
  readonly writer: EnvelopeWriter;
  readonly projections: ProjectionStore;
  readonly verifier: SignatureVerifier;
  readonly certificates: CertificateStore;
  readonly witness: WitnessLog;
  readonly nonces: NonceStore;
  readonly antiAbuse: AntiAbuseDeps;
  readonly nodeSigner: NodeSigner;
  readonly clock: Clock;
  readonly federation?: FederationOut;
  readonly events?: EventBus;
  readonly cache?: TaggedCache;
  readonly clockWindow?: ClockWindow;
}

export class IngressPipeline {
  constructor(private readonly deps: IngressDeps) {}

  /**
   * Run an envelope through all 19 steps.
   *
   * Returns a receipt on acceptance, and on a duplicate returns the ORIGINAL receipt
   * rather than an error (ER-01). Any other failure throws `EnvelopeRejected` carrying the
   * typed code from `Plans/02` §6.
   */
  async accept(raw: Uint8Array): Promise<Receipt> {
    const d = this.deps;

    // ── 1. SIZE — on raw bytes, before parse ──────────────────────────────────────────
    acceptSize(raw);

    // ── 2. PARSE — deterministic, exactly one accepted form ───────────────────────────
    const { envelope, canonical } = parseEnvelope(raw);

    // ── 3-5. VERSION, DOMAIN, PLANE ───────────────────────────────────────────────────
    acceptVersion(envelope.version);
    acceptDomain(envelope.domain, d.registry);
    acceptPlane(envelope.domain, envelope.plane, d.registry);

    // The registry guarantees a row exists for any domain that passed step 4.
    const entry = d.registry.lookup(envelope.domain);
    if (!entry) {
      throw new EnvelopeRejected(RejectionCode.UNKNOWN_DOMAIN, 'domain is not registered');
    }
    const { handler, spec } = entry;

    // ── 6-7. ALG POLICY, PRIORITY (plus the per-domain size budget) ───────────────────
    acceptDomainSize(raw, spec);
    acceptAlgPolicy(envelope, spec);
    acceptPriority(envelope, spec);

    // ── 8. CLOCK ──────────────────────────────────────────────────────────────────────
    acceptClock(envelope.createdAtMs, d.clock.nowMs(), d.clockWindow ?? DEFAULT_CLOCK_WINDOW);

    // ── 9. SIGNATURE — over the canonical bytes of fields 1..12 ───────────────────────
    acceptSignature(envelope, canonical, d.verifier);

    // ── 10. CERTIFICATE ───────────────────────────────────────────────────────────────
    await acceptCertificate(envelope, d.certificates, spec.requiresCertificate);

    // ── 11. DEDUPE — returns the original receipt instead of failing (ER-01) ──────────
    try {
      await acceptDedupe(envelope, d.reader);
    } catch (e) {
      if (e instanceof EnvelopeRejected && e.code === RejectionCode.DUPLICATE) {
        return await this.receiptForExisting(envelope.contentId);
      }
      throw e;
    }

    // ── 12. REPLAY ────────────────────────────────────────────────────────────────────
    await acceptReplay(envelope, spec.idempotent, (key, nonce) => d.nonces.seen(key, nonce));

    // ── 13. ANTI-ABUSE — the first step permitted to mutate state ─────────────────────
    // Everything above this line is read-only, which is what VP-01 guarantees.
    await acceptAntiAbuse(envelope, spec, d.antiAbuse);

    // ── 14. AUTHORISE — against projections, writes nothing ──────────────────────────
    const body = this.decodeBody(handler, envelope);
    const decision = await handler.authorize(body, envelope);
    if (!decision.allowed) {
      throw new EnvelopeRejected(RejectionCode.FORBIDDEN, decision.reason);
    }

    // ── 15. BODY VALIDATE — pure, domain-specific ────────────────────────────────────
    const validation = handler.validate(body, envelope);
    if (!validation.ok) {
      throw new EnvelopeRejected(RejectionCode.BODY_INVALID, validation.reason, {
        ...(validation.field !== undefined ? { field: validation.field } : {}),
      });
    }

    // ── 16-17. APPLY + WITNESS — one transaction, atomic together (VP-02) ────────────
    const acceptedAtMs = d.clock.nowMs();
    let receipt: Receipt;
    try {
      receipt = await d.projections.transaction(async (tx) => {
        if (!spec.idempotent && !(await d.nonces.reserve(envelope.authorKey, envelope.nonce, tx))) {
          throw new EnvelopeRejected(RejectionCode.REPLAY, 'nonce has already been used');
        }
        const stored = await d.writer.put(envelope, raw, tx);
        await handler.project(body, envelope, tx);
        const leafIndex = await d.witness.append(envelope.contentId, tx);
        const createdReceipt = await this.signReceipt(
          envelope.contentId,
          stored.logIndex,
          leafIndex,
          acceptedAtMs,
          tx,
        );
        await d.writer.recordReceipt(envelope.contentId, createdReceipt, leafIndex, tx);
        return createdReceipt;
      });
    } catch (error) {
      if (error instanceof DuplicateContentError) {
        return this.receiptForExisting(error.contentId);
      }
      throw error;
    }

    // ── 18. RECEIPT ───────────────────────────────────────────────────────────────────
    // ── 19. FANOUT — after commit, and never able to roll it back ────────────────────
    // A notification failure must not undo an accepted envelope.
    // These are post-commit delivery attempts. A transient notification or federation
    // error must not turn an already witnessed write into an HTTP failure; the durable
    // outbox adapter retries delivery independently.
    try {
      await handler.afterCommit?.(body, envelope);
    } catch {
      // The acceptance receipt is authoritative; observers are best-effort here.
    }
    try {
      await d.federation?.enqueue(envelope);
    } catch {
      // See the durable outbox note above.
    }
    d.events?.publish({ type: 'accepted', envelope, receipt });
    try {
      await d.cache?.invalidate('forum');
      if (envelope.scope) await d.cache?.invalidate(`scope:${envelope.scope}`);
      await d.cache?.invalidate(`content:${envelope.contentId}`);
    } catch {
      // Cache state is disposable; an invalidation failure cannot undo acceptance.
    }

    return receipt;
  }

  /** Body decode failures are BODY_INVALID, not MALFORMED — the envelope itself was fine. */
  private decodeBody(
    handler: { decode(body: Uint8Array): unknown },
    envelope: ParsedEnvelope,
  ): never {
    try {
      return handler.decode(envelope.body) as never;
    } catch {
      throw new EnvelopeRejected(RejectionCode.BODY_INVALID, 'body could not be decoded', {
        field: 'body',
      });
    }
  }

  private async signReceipt(
    contentId: string,
    logIndex: number,
    leafIndex: number,
    acceptedAtMs: number,
    tx: Tx,
  ): Promise<Receipt> {
    const d = this.deps;
    const serverId = d.nodeSigner.serverId;
    const sth = await d.witness.currentSth(tx);
    const inclusionProof = (await d.witness.inclusionProof(contentId, tx)).path;
    const signature = d.nodeSigner.sign(
      receiptSigningBytes(
        contentId,
        logIndex,
        leafIndex,
        acceptedAtMs,
        serverId,
        d.nodeSigner.publicKey,
        sth,
        inclusionProof,
      ),
    );
    return {
      contentId,
      logIndex,
      leafIndex,
      acceptedAtMs,
      serverId,
      serverKey: d.nodeSigner.publicKey,
      signature,
      sth,
      inclusionProof,
    };
  }

  /**
   * Rebuild the receipt for content already in the log.
   *
   * Derived from the stored record rather than remembered separately, so it is impossible
   * for the stored log position and the receipt's claim about it to drift apart.
   */
  private async receiptForExisting(contentId: string): Promise<Receipt> {
    const stored = await this.deps.reader.get(contentId);
    if (!stored) {
      // Only reachable if the record vanished between `has` and `get`.
      throw new EnvelopeRejected(RejectionCode.DUPLICATE, 'content already accepted');
    }
    if (stored.receipt) return stored.receipt;
    throw new Error(`accepted envelope ${contentId} has no persisted receipt`);
  }
}
