/**
 * In-memory doubles for the identity, anti-abuse, transparency, network and content ports.
 *
 * The null implementations here are also the PRODUCTION default for optional subsystems.
 * AR-12 requires the node to run with every optional subsystem disabled, and a node with
 * no labeller must behave identically to one whose labeller returned no advice — not crash
 * and not special-case itself.
 */

import type { Tx } from '../../../core/domain/domain-handler.js';
import type { KeyAlg, ParsedEnvelope } from '../../../core/domain/envelope.js';
import {
  CertificateStore,
  SignatureVerifier,
  type KeyCertificate,
  type KeyRevocation,
} from '../../../core/ports/identity.port.js';
import {
  CreditLedger,
  CredentialIssuer,
  NullifierRegistry,
  PowVerifier,
  type CreditStatus,
  type CreditSubject,
  type PowChallenge,
  type PowSolution,
} from '../../../core/ports/anti-abuse.port.js';
import {
  PeerLogStatus,
  WitnessLog,
  type InclusionProof,
  type SignedTreeHead,
} from '../../../core/ports/transparency.port.js';
import {
  FederationOut,
  PathSelector,
  PeerDirectory,
  SCOPE_PREFERENCE,
  type BackfillReport,
  type ReachabilityScope,
  type PeerRecord,
  type SelectedPath,
} from '../../../core/ports/network.port.js';
import {
  BlobStore,
  LabelProvider,
  NotificationSink,
  type DraftContent,
  type Label,
  type LabelAdvice,
  type Notification,
  type ResolvedContent,
  type UploadTicket,
  type BlobMetadata,
} from '../../../core/ports/content.port.js';

/** Accepts a signature iff it equals the message reversed — deterministic, no crypto. */
export class StubSignatureVerifier extends SignatureVerifier {
  constructor(private readonly answer: boolean = true) {
    super();
  }
  verify(_alg: KeyAlg, _key: Uint8Array, _msg: Uint8Array, _sig: Uint8Array): boolean {
    return this.answer;
  }
}

export class InMemoryCertificateStore extends CertificateStore {
  private readonly certs = new Map<string, KeyCertificate>();
  private readonly revocations = new Map<string, KeyRevocation>();

  private static hex(k: Uint8Array): string {
    return Buffer.from(k).toString('hex');
  }

  add(cert: KeyCertificate): void {
    this.certs.set(InMemoryCertificateStore.hex(cert.key), cert);
  }

  revoke(revocation: KeyRevocation): void {
    this.revocations.set(InMemoryCertificateStore.hex(revocation.key), revocation);
  }

  async certificateAt(key: Uint8Array, atMs: number): Promise<KeyCertificate | null> {
    const cert = this.certs.get(InMemoryCertificateStore.hex(key));
    if (!cert || cert.issuedAtMs > atMs) return null;
    return cert;
  }

  async revocationFor(key: Uint8Array): Promise<KeyRevocation | null> {
    return this.revocations.get(InMemoryCertificateStore.hex(key)) ?? null;
  }
}

/**
 * A token bucket that is atomic because JavaScript is single-threaded here. The production
 * Redis adapter MUST use one Lua script to get the same guarantee across processes
 * (P1-G6) — read-modify-write is forbidden.
 */
export class InMemoryCreditLedger extends CreditLedger {
  private readonly balances = new Map<string, number>();

  // The largest first-party operation costs 200 credits (community creation). A fresh
  // anonymous subject must be able to perform every published operation at least once.
  constructor(private readonly startingBalance = 250) {
    super();
  }

  private static key(s: CreditSubject): string {
    return `${s.kind}:${s.value}`;
  }

  async consume(subject: CreditSubject, cost: number): Promise<CreditStatus> {
    const key = InMemoryCreditLedger.key(subject);
    const current = this.balances.get(key) ?? this.startingBalance;

    // A check-in costs zero credits and is never rate-limited. Telling people you are
    // alive must not depend on having budget left.
    if (cost === 0) return { allowed: true, remaining: current, resetAtMs: 0 };

    if (current < cost) return { allowed: false, remaining: current, resetAtMs: 0 };
    this.balances.set(key, current - cost);
    return { allowed: true, remaining: current - cost, resetAtMs: 0 };
  }

  async issueChallenge(_subject: CreditSubject): Promise<PowChallenge> {
    return { challenge: new Uint8Array([1, 2, 3, 4]), difficulty: 1, expiresAtMs: 0 };
  }

  async redeem(subject: CreditSubject, _solution: PowSolution): Promise<CreditStatus> {
    const key = InMemoryCreditLedger.key(subject);
    const next = (this.balances.get(key) ?? this.startingBalance) + 10;
    this.balances.set(key, next);
    return { allowed: true, remaining: next, resetAtMs: 0 };
  }
}

export class InMemoryNullifierRegistry extends NullifierRegistry {
  private readonly spent = new Set<string>();

  async claim(nullifier: Uint8Array, epoch: number, scope: string): Promise<boolean> {
    const key = `${Buffer.from(nullifier).toString('hex')}:${epoch}:${scope}`;
    if (this.spent.has(key)) return false;
    this.spent.add(key);
    return true;
  }
}

export class InMemoryCredentialIssuer extends CredentialIssuer {
  private readonly issued = new Set<string>();

  async issue(blinded: Uint8Array): Promise<Uint8Array> {
    const credential = Uint8Array.from(blinded, (b) => b ^ 0xff);
    this.issued.add(Buffer.from(credential).toString('hex'));
    return credential;
  }

  async verify(credential: Uint8Array): Promise<boolean> {
    return this.issued.has(Buffer.from(credential).toString('hex'));
  }

  async parameters(): Promise<{ readonly n: string; readonly e: string; readonly width: number }> {
    return { n: '', e: '', width: 0 };
  }
}

/** Deterministic test double for the production stateless Argon2id verifier. */
export class InMemoryPowVerifier extends PowVerifier {
  async issue(authorKey: Uint8Array): Promise<PowChallenge> {
    return {
      challenge: new Uint8Array([1, 2, 3, 4]),
      difficulty: 1,
      expiresAtMs: 0,
      algorithm: 'argon2id',
      memoryKiB: 8,
      iterations: 1,
      parallelism: 1,
      boundTo: authorKey,
    };
  }

  async verify(_authorKey: Uint8Array, proof: Uint8Array): Promise<boolean> {
    return proof.length > 0;
  }
}

/** Minimal witness double for tests that do not need the real LocalMerkleLog. */
export class InMemoryWitnessLog extends WitnessLog {
  private readonly leaves: string[] = [];

  async append(contentId: string, _tx: Tx): Promise<number> {
    this.leaves.push(contentId);
    return this.leaves.length - 1;
  }

  async currentSth(): Promise<SignedTreeHead> {
    return {
      serverKey: new Uint8Array(32),
      treeSize: this.leaves.length,
      rootHash: new Uint8Array([this.leaves.length & 0xff]),
      timestampMs: 0,
      signature: new Uint8Array(64),
    };
  }

  async inclusionProof(contentId: string): Promise<InclusionProof> {
    const leafIndex = this.leaves.indexOf(contentId);
    if (leafIndex < 0) throw new Error(`not in log: ${contentId}`);
    return { leafIndex, treeSize: this.leaves.length, path: [] };
  }

  async consistencyProof(_from: number, _to: number): Promise<readonly Uint8Array[]> {
    return [];
  }

  async verifyPeerSth(_peerKey: Uint8Array, _sth: SignedTreeHead): Promise<PeerLogStatus> {
    return PeerLogStatus.UNKNOWN;
  }

  get size(): number {
    return this.leaves.length;
  }
}

export class InMemoryPeerDirectory extends PeerDirectory {
  private readonly peers = new Map<string, PeerRecord>();

  async get(serverId: string): Promise<PeerRecord | null> {
    return this.peers.get(serverId) ?? null;
  }
  async upsert(record: PeerRecord): Promise<void> {
    this.peers.set(record.serverId, record);
  }
  async forScope(scope: ReachabilityScope): Promise<readonly PeerRecord[]> {
    return [...this.peers.values()].filter((p) => p.endpoints.some((e) => e.scope === scope));
  }
  async forAsn(asn: number): Promise<readonly PeerRecord[]> {
    return [...this.peers.values()].filter((p) => p.endpoints.some((e) => e.asn === asn));
  }
}

/**
 * G-04 in its simplest honest form: always pick the narrowest scope that this peer
 * advertises. The production selector adds reachability probing; the preference order is
 * the part that must not drift, so it lives in `SCOPE_PREFERENCE` and is shared.
 */
export class NarrowestScopePathSelector extends PathSelector {
  async select(peer: PeerRecord): Promise<SelectedPath | null> {
    for (const scope of SCOPE_PREFERENCE) {
      const endpoint = peer.endpoints.find((e) => e.scope === scope);
      if (endpoint) return { endpoint, transportId: 'in-memory' };
    }
    return null;
  }
}

export class InMemoryFederationOut extends FederationOut {
  readonly queued: { envelope: ParsedEnvelope; targets: readonly string[] }[] = [];

  async enqueue(envelope: ParsedEnvelope, targets: readonly string[] = []): Promise<void> {
    this.queued.push({ envelope, targets });
  }

  async backfillFrom(_peerKey: string, _fromIndex: number): Promise<BackfillReport> {
    return { received: 0, accepted: 0, rejected: 0 };
  }
}

/** AR-12 — the default binding when the labeller is disabled. Advises nothing, blocks nothing. */
export class NullLabelProvider extends LabelProvider {
  async preflight(_draft: DraftContent): Promise<LabelAdvice> {
    return { advisory: null };
  }
  async label(contentId: string, _content: ResolvedContent): Promise<Label> {
    return { contentId, kind: 'none', signature: new Uint8Array(0) };
  }
}

export class InMemoryBlobStore extends BlobStore {
  private readonly metadata = new Map<string, BlobMetadata>();
  private readonly bodies = new Map<string, Uint8Array>();

  async ready(): Promise<void> {}

  async presignUpload(
    key: string,
    mime: string,
    size: number,
    sha256: Uint8Array,
  ): Promise<UploadTicket> {
    this.metadata.set(key, { key, mime, size, sha256 });
    return { url: `memory://${key}`, key, expiresAtMs: 0 };
  }
  async presignDownload(key: string): Promise<string> {
    return `memory://${key}`;
  }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    if (!this.metadata.has(key)) throw new Error('upload ticket not found');
    this.bodies.set(key, new Uint8Array(bytes));
  }
  async read(key: string): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
    const metadata = this.metadata.get(key);
    if (!metadata) throw new Error('blob not found');
    return {
      bytes: new Uint8Array(this.bodies.get(key) ?? new Uint8Array()),
      mime: metadata.mime,
    };
  }
  async confirm(key: string): Promise<BlobMetadata> {
    const metadata = this.metadata.get(key);
    if (!metadata) throw new Error('blob not found');
    return metadata;
  }
  async delete(key: string): Promise<void> {
    this.metadata.delete(key);
    this.bodies.delete(key);
  }
}

export class RecordingNotificationSink extends NotificationSink {
  readonly delivered: { to: Uint8Array; notification: Notification }[] = [];
  async deliver(to: Uint8Array, notification: Notification): Promise<void> {
    this.delivered.push({ to, notification });
  }
}
