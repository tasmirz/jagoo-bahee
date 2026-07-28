/**
 * A fully wired node, in memory, for pipeline tests.
 *
 * Uses the REAL signature verifier and the REAL Merkle log — not stubs. A pipeline test
 * against a verifier that always returns true proves almost nothing, and would have hidden
 * every canonicalisation bug this project exists to prevent.
 *
 * Lives OUTSIDE `core/` on purpose: it wires adapters, and `core/**` may not import an
 * adapter (AR-01). The import-boundary lint caught this when it was first placed in
 * `core/app/` — the rule is doing its job, so the file moved rather than the rule.
 */

import { ed25519 } from '@jagoo/sdk/crypto';
import { canonicalBytes, encodeSignedEnvelope, Plane as SdkPlane } from '@jagoo/sdk/core';
import type { CanonicalEnvelope } from '@jagoo/sdk/core';
import { DomainRegistry } from '../core/domain/domain-registry.js';
import { IngressPipeline, type IngressDeps } from '../core/app/ingress.js';
import {
  FixedClock,
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
} from '../adapters/outbound/in-memory/in-memory-stores.js';
import {
  InMemoryCertificateStore,
  InMemoryCreditLedger,
  InMemoryCredentialIssuer,
  InMemoryFederationOut,
  InMemoryNullifierRegistry,
} from '../adapters/outbound/in-memory/in-memory-services.js';
import { LocalMerkleLog } from '../adapters/outbound/in-memory/local-merkle-log.js';
import {
  InMemoryNodeSigner,
  InMemoryNonceStore,
} from '../adapters/outbound/in-memory/in-memory-node.js';
import { RealSignatureVerifier } from '../adapters/outbound/in-memory/real-signature-verifier.js';

export const AUTHOR_SEED = new Uint8Array(32).fill(3);
export const AUTHOR_KEY = ed25519.derivePublicKey(AUTHOR_SEED);

/** 2026-01-01T00:00:00Z — a fixed instant, so clock tests are deterministic. */
export const NOW_MS = 1767225600000;

export interface Harness {
  readonly pipeline: IngressPipeline;
  readonly registry: DomainRegistry;
  readonly envelopes: InMemoryEnvelopeStore;
  readonly projections: InMemoryProjectionStore;
  readonly witness: LocalMerkleLog;
  readonly credits: InMemoryCreditLedger;
  readonly nullifiers: InMemoryNullifierRegistry;
  readonly credentials: InMemoryCredentialIssuer;
  readonly certificates: InMemoryCertificateStore;
  readonly federation: InMemoryFederationOut;
  readonly clock: FixedClock;
  readonly nodeSigner: InMemoryNodeSigner;
  readonly deps: IngressDeps;
}

export async function buildHarness(
  configure?: (registry: DomainRegistry, projections: InMemoryProjectionStore) => void,
): Promise<Harness> {
  const clock = new FixedClock(NOW_MS);
  const registry = new DomainRegistry();
  const envelopes = new InMemoryEnvelopeStore(clock);
  const projections = new InMemoryProjectionStore();
  const nodeSigner = new InMemoryNodeSigner();
  const witness = new LocalMerkleLog(nodeSigner, clock);
  const certificates = new InMemoryCertificateStore();
  const credits = new InMemoryCreditLedger(1000);
  const nullifiers = new InMemoryNullifierRegistry();
  const credentials = new InMemoryCredentialIssuer();
  const federation = new InMemoryFederationOut();

  // Step 10 requires a certificate that predates the envelope.
  certificates.add({ key: AUTHOR_KEY, issuedAtMs: 0 });

  configure?.(registry, projections);

  const deps: IngressDeps = {
    registry,
    reader: envelopes,
    writer: envelopes,
    projections,
    verifier: new RealSignatureVerifier(),
    certificates,
    witness,
    nonces: new InMemoryNonceStore(),
    antiAbuse: { credits, nullifiers, credentials },
    nodeSigner,
    clock,
    federation,
  };

  return {
    pipeline: new IngressPipeline(deps),
    registry,
    envelopes,
    projections,
    witness,
    credits,
    nullifiers,
    credentials,
    certificates,
    federation,
    clock,
    nodeSigner,
    deps,
  };
}

export interface EnvelopeOverrides {
  readonly domain?: string;
  readonly plane?: number;
  readonly scope?: string;
  readonly priority?: number;
  readonly keyAlg?: number;
  readonly version?: number;
  readonly createdAtMs?: bigint;
  readonly nonce?: Uint8Array;
  readonly body?: Uint8Array;
  readonly credential?: Uint8Array;
  readonly nullifier?: Uint8Array;
  readonly epoch?: number;
  readonly seed?: Uint8Array;
  /** Corrupt the signature deliberately. */
  readonly forgeSignature?: boolean;
}

/** Build and sign an envelope exactly as a client would — same encoder, same key handling. */
export function signEnvelope(over: EnvelopeOverrides = {}): Uint8Array {
  const seed = over.seed ?? AUTHOR_SEED;
  const publicKey = ed25519.derivePublicKey(seed);

  const anti =
    over.credential || over.nullifier || over.epoch
      ? {
          credential: over.credential ?? new Uint8Array(0),
          nullifier: over.nullifier ?? new Uint8Array(0),
          epoch: over.epoch ?? 0,
          pow: new Uint8Array(0),
        }
      : undefined;

  const base: CanonicalEnvelope = {
    version: over.version ?? 1,
    plane: (over.plane ?? SdkPlane.FORUM) as SdkPlane,
    domain: over.domain ?? 'jb:post:create:v1',
    author_key: publicKey,
    key_alg: (over.keyAlg ?? 1) as 1,
    parent: '',
    scope: over.scope ?? 'dhaka-relief@jbs1a4f7m2k',
    created_at_ms: over.createdAtMs ?? BigInt(NOW_MS),
    nonce: over.nonce ?? new Uint8Array(16).fill(5),
    priority: (over.priority ?? 4) as 4,
    body: over.body ?? new Uint8Array(0),
    ...(anti ? { anti_abuse: anti } : {}),
  };

  const signature = over.forgeSignature
    ? new Uint8Array(64).fill(0xaa)
    : ed25519.sign(canonicalBytes(base), seed);

  return encodeSignedEnvelope({ ...base, signature });
}
