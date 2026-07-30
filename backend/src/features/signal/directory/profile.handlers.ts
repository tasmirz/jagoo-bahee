import { crypto as sdkCrypto, identityId } from '@jagoo/sdk';
import { SignalDirectoryProfile, type IdentityClaim } from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  denied,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';

export const SIGNAL_DIRECTORY_PROFILES_COLLECTION = 'signal_directory_profiles';

export interface SignalDirectoryProfileDoc {
  readonly id: string;
  /** Server-issued, collision-free codename. It is the Signal identity ID, never a Forum handle. */
  readonly codename: string;
  readonly identityKey: string;
  readonly displayName: string;
  readonly nameSkeleton: string;
  readonly bio: string;
  readonly claims: readonly {
    readonly kind: number;
    readonly value: string;
    readonly proof: string;
    readonly assertedAtMs: number;
  }[];
  readonly rnsPublicKey: string;
  readonly lxmfDestinationHash: string;
  readonly transportBindingSignature: string;
  readonly languages: readonly string[];
  readonly discoverable: boolean;
  readonly revision: string;
  readonly updatedAtMs: number;
  readonly contentId: string;
}

const text = new TextEncoder();
const BINDING_PREFIX = text.encode('jb:signal:lxmf-binding:v1\0');

export function signalTransportBindingBytes(
  rnsPublicKey: Uint8Array,
  lxmfDestinationHash: Uint8Array,
): Uint8Array {
  const bytes = new Uint8Array(BINDING_PREFIX.length + rnsPublicKey.length + lxmfDestinationHash.length);
  bytes.set(BINDING_PREFIX);
  bytes.set(rnsPublicKey, BINDING_PREFIX.length);
  bytes.set(lxmfDestinationHash, BINDING_PREFIX.length + rnsPublicKey.length);
  return bytes;
}

export function signalDirectoryNameSkeleton(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]/gu, '');
}

export function signalDirectoryCodename(identity: string): string {
  return identity;
}

function claims(value: readonly IdentityClaim[]): SignalDirectoryProfileDoc['claims'] {
  return value.map((claim) => ({
    kind: claim.kind,
    value: claim.value.trim(),
    proof: claim.proof.trim(),
    assertedAtMs: Number(claim.asserted_at_ms),
  }));
}

export class SignalDirectoryProfileHandler implements DomainHandler<SignalDirectoryProfile> {
  readonly domain = 'jb:signal:profile:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): SignalDirectoryProfile {
    return SignalDirectoryProfile.decode(body);
  }

  validate(body: SignalDirectoryProfile, env: ParsedEnvelope): ValidationResult {
    const displayName = body.display_name.trim();
    if (!displayName || [...displayName].length > 80) {
      return invalid('display_name must be 1 to 80 characters', 'display_name');
    }
    if ([...body.bio].length > 500) return invalid('bio exceeds 500 characters', 'bio');
    if (body.revision === 0n) return invalid('revision must be positive', 'revision');
    if (body.languages.length > 8 || body.languages.some((language) => !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language))) {
      return invalid('languages must contain at most 8 BCP-47 tags', 'languages');
    }

    /**
     * The LXMF binding is OPTIONAL — either wholly absent or wholly present and valid.
     *
     * It used to be mandatory, which quietly made a searchable name a Reticulum feature:
     * `lxmf_destination_hash` can only come from a running RNS stack, and RNS runs on an
     * Android development build and nowhere else. So on iOS, in Expo Go, and on any device
     * without the radio, a person could not publish a username at all — while the directory
     * search that finds them, and the IP messaging that reaches them, both needed no
     * Reticulum whatsoever. The mesh binding is an ADDITION to a profile, not the thing
     * that makes one legitimate.
     *
     * Strictly a loosening: every profile that validated before still validates, byte for
     * byte. Partial bindings stay rejected, because a destination hash nobody signed for is
     * worse than none — it would route messages at an address the author never claimed.
     */
    const binding = [
      body.rns_public_key.length,
      body.lxmf_destination_hash.length,
      body.transport_binding_sig.length,
    ];
    const absent = binding.every((length) => length === 0);
    if (!absent) {
      if (body.rns_public_key.length !== 64) {
        return invalid('rns_public_key must be 64 bytes', 'rns_public_key');
      }
      if (body.lxmf_destination_hash.length !== 16) {
        return invalid('lxmf_destination_hash must be 16 bytes', 'lxmf_destination_hash');
      }
      if (body.transport_binding_sig.length !== 64) {
        return invalid('transport_binding_sig must be 64 bytes', 'transport_binding_sig');
      }
      if (
        !sdkCrypto.ed25519.verify(
          body.transport_binding_sig,
          signalTransportBindingBytes(body.rns_public_key, body.lxmf_destination_hash),
          env.authorKey,
        )
      ) {
        return invalid('transport binding signature does not verify', 'transport_binding_sig');
      }
    }
    return valid;
  }

  /**
   * Revision must increase, and a name is first-come on this node.
   *
   * ── Why uniqueness lives here and what it is worth ────────────────────────────────
   * `display_name` is the handle people search for, and it used to be free text: two
   * identities could both publish "Amina" and both were valid, so a name carried no
   * information at all and impersonation was free. First-come makes a name mean something
   * locally.
   *
   * It is emphatically NOT global. Another node in the federation can accept the same name
   * for a different key, and no amount of node-side checking can prevent that without a
   * naming authority — which this project rejects on purpose. So the client always shows a
   * handle beside its fingerprint and origin node; the name narrows the search, the
   * fingerprint is what identifies.
   *
   * ── Determinism, because this reads a projection ──────────────────────────────────
   * `rebuild-projections` replays the envelope log in order and re-runs this decision, so
   * first-writer-wins is stable: the same log yields the same holder every time. A
   * tiebreak on anything not derived from the log (arrival time, insertion order) would
   * make rebuilds non-byte-identical, which §4.5 forbids.
   */
  async authorize(body: SignalDirectoryProfile, env: ParsedEnvelope): Promise<AuthDecision> {
    const author = identityId(env.authorKey);
    const profiles = this.projections.collection<SignalDirectoryProfileDoc>(
      SIGNAL_DIRECTORY_PROFILES_COLLECTION,
    );
    const existing = await profiles.findOne({ id: author });
    if (existing && BigInt(existing.revision) >= body.revision) {
      return denied('profile revision must increase');
    }
    const skeleton = signalDirectoryNameSkeleton(body.display_name);
    if (!skeleton) return denied('display_name must contain at least one letter or number');
    const holder = await profiles.findOne({ nameSkeleton: skeleton });
    if (holder && holder.id !== author) {
      return denied('that name is already taken on this server');
    }
    return allowed;
  }

  async project(body: SignalDirectoryProfile, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = identityId(env.authorKey);
    await this.projections
      .collection<SignalDirectoryProfileDoc>(SIGNAL_DIRECTORY_PROFILES_COLLECTION)
      .put(
        id,
        {
          id,
          codename: signalDirectoryCodename(id),
          identityKey: Buffer.from(env.authorKey).toString('hex'),
          displayName: body.display_name.trim(),
          nameSkeleton: signalDirectoryNameSkeleton(body.display_name),
          bio: body.bio.trim(),
          claims: claims(body.claims),
          rnsPublicKey: Buffer.from(body.rns_public_key).toString('base64'),
          lxmfDestinationHash: Buffer.from(body.lxmf_destination_hash).toString('hex'),
          transportBindingSignature: Buffer.from(body.transport_binding_sig).toString('base64'),
          languages: [...new Set(body.languages)],
          discoverable: body.discoverable,
          revision: body.revision.toString(),
          updatedAtMs: Number(env.createdAtMs),
          contentId: env.contentId,
        },
        tx,
      );
  }
}
