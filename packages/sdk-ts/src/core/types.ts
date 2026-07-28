/**
 * The signed shape of an envelope.
 *
 * Deliberately a plain structure rather than the generated protobuf class: the canonical
 * encoder must be a pure function of exactly these twelve fields, and mixing in a
 * generated type's unknown-field bag or its optional-presence semantics is how a second
 * accepted form creeps in (EN-02).
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1–2
 */

export const ENVELOPE_VERSION = 1 as const;

export enum Plane {
  UNSPECIFIED = 0,
  FORUM = 1,
  SIGNAL = 2,
}

export enum KeyAlg {
  UNSPECIFIED = 0,
  ED25519 = 1,
  ML_DSA_44 = 2,
  FALCON_512 = 3,
}

export enum Priority {
  UNSPECIFIED = 0,
  BROADCAST = 1,
  DIRECT = 2,
  CHECKIN = 3,
  BULK = 4,
}

/**
 * VIS-07: rate limiting must work against a fully anonymous actor. MAY be entirely
 * empty when arriving over MESH or RETICULUM, where the receiving node applies
 * transport-appropriate limits instead.
 */
export interface AntiAbuse {
  /** Unblinded membership token (FORUM plane). */
  readonly credential?: Uint8Array;
  /** H(domain ‖ epoch ‖ secret) (FORUM plane). */
  readonly nullifier?: Uint8Array;
  readonly epoch?: number;
  /** Argon2id proof, when demanded. */
  readonly pow?: Uint8Array;
}

/** Fields 1..12 — everything covered by the signature and by the content ID. */
export interface CanonicalEnvelope {
  /** MUST be 1. An unknown version is hard-rejected, never guessed (EN-02). */
  readonly version: number;
  /** Inside the signature, which is what makes cross-plane replay impossible (SEP-02). */
  readonly plane: Plane;
  /** e.g. "jb:post:create:v1". Must exist in the registry (RG-01). */
  readonly domain: string;
  /** Raw public key. Identity IS this value (VIS-02). */
  readonly author_key: Uint8Array;
  readonly key_alg: KeyAlg;
  /** content_id of the parent, "" if none. */
  readonly parent: string;
  /** community_id (FORUM) | channel_id (SIGNAL) | "". Never a row ID (ID-01). */
  readonly scope: string;
  /** Milliseconds since epoch. int64 to stay exact above 2^53. */
  readonly created_at_ms: bigint;
  /** 16 random bytes. Required on non-idempotent domains (AB-05). */
  readonly nonce: Uint8Array;
  readonly priority: Priority;
  /** Serialized typed body — opaque to the canonical encoder. */
  readonly body: Uint8Array;
  readonly anti_abuse?: AntiAbuse;
}

/** A canonical envelope plus its signature — field 13. */
export interface SignedEnvelope extends CanonicalEnvelope {
  /** Ed25519 over the canonical bytes of fields 1..12. */
  readonly signature: Uint8Array;
}

/** Envelope field numbers. Frozen — these are what the canonical order sorts by. */
export const FIELD = {
  VERSION: 1,
  PLANE: 2,
  DOMAIN: 3,
  AUTHOR_KEY: 4,
  KEY_ALG: 5,
  PARENT: 6,
  SCOPE: 7,
  CREATED_AT_MS: 8,
  NONCE: 9,
  PRIORITY: 10,
  BODY: 11,
  ANTI_ABUSE: 12,
  SIGNATURE: 13,
} as const;

/** AntiAbuse field numbers. */
export const ANTI_ABUSE_FIELD = {
  CREDENTIAL: 1,
  NULLIFIER: 2,
  EPOCH: 3,
  POW: 4,
} as const;

/** Identifier prefixes (Plans/02 §7). Every one is stable across nodes, forever. */
export const PREFIX = {
  /** Content: jb1 + base32(sha256(canonical envelope bytes)). */
  CONTENT: 'jb1',
  /** Identity, either plane: jbk1 + base32(pubkey). */
  IDENTITY: 'jbk1',
  /** Channel: jbc1 + base32(channel signing key). */
  CHANNEL: 'jbc1',
  /** Server: jbs1 + base32(server pubkey). */
  SERVER: 'jbs1',
} as const;

export const NONCE_BYTES = 16;
export const ED25519_PUBLIC_KEY_BYTES = 32;
export const ED25519_SIGNATURE_BYTES = 64;
