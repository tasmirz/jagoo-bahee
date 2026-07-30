/**
 * Stateless, key-bound Argon2id proof of work (AB-04 / P1-G9).
 *
 * A challenge is an HMAC over the author key and expiry. Issuing one allocates no
 * per-request state. The proof carries the expiry, MAC and Argon2id digest, allowing any
 * process with the node secret to verify it after store-and-forward.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { PowVerifier, type PowChallenge } from '../../../core/ports/anti-abuse.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

const PROOF_VERSION = 1;
const HEADER_BYTES = 1 + 8 + 32;
const DIGEST_BYTES = 32;

export interface PowParameters {
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly ttlMs: number;
}

const DEFAULT_PARAMETERS: PowParameters = {
  memoryKiB: 32 * 1024,
  iterations: 2,
  parallelism: 1,
  ttlMs: 5 * 60 * 1000,
};

function expiryBytes(expiresAtMs: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(expiresAtMs), false);
  return bytes;
}

export class StatelessArgon2Pow extends PowVerifier {
  constructor(
    private readonly secret: Uint8Array,
    private readonly clock: Clock,
    readonly parameters: PowParameters = DEFAULT_PARAMETERS,
  ) {
    super();
    if (secret.length < 32) throw new Error('POW_SECRET must contain at least 32 bytes');
  }

  private challengeFor(authorKey: Uint8Array, expiresAtMs: number): Uint8Array {
    return new Uint8Array(
      createHmac('sha256', this.secret)
        .update('jb-pow-v1\0')
        .update(authorKey)
        .update(expiryBytes(expiresAtMs))
        .digest(),
    );
  }

  async issue(authorKey: Uint8Array): Promise<PowChallenge> {
    const issuedAtMs = this.clock.nowMs();
    const expiresAtMs = issuedAtMs + this.parameters.ttlMs;
    return {
      challenge: this.challengeFor(authorKey, expiresAtMs),
      difficulty: this.parameters.memoryKiB,
      expiresAtMs,
      issuedAtMs,
      algorithm: 'argon2id',
      memoryKiB: this.parameters.memoryKiB,
      iterations: this.parameters.iterations,
      parallelism: this.parameters.parallelism,
      boundTo: authorKey,
    };
  }

  async solve(authorKey: Uint8Array, challenge: PowChallenge): Promise<Uint8Array> {
    // Hex is the cross-platform password representation. Native RN Argon2 accepts a
    // string, so feeding arbitrary bytes would silently UTF-8 transform some challenges.
    const digest = await argon2.hash(Buffer.from(challenge.challenge).toString('hex'), {
      type: argon2.argon2id,
      salt: Buffer.from(authorKey),
      memoryCost: challenge.memoryKiB ?? this.parameters.memoryKiB,
      timeCost: challenge.iterations ?? this.parameters.iterations,
      parallelism: challenge.parallelism ?? this.parameters.parallelism,
      hashLength: DIGEST_BYTES,
      raw: true,
    });
    const proof = new Uint8Array(HEADER_BYTES + DIGEST_BYTES);
    proof[0] = PROOF_VERSION;
    proof.set(expiryBytes(challenge.expiresAtMs), 1);
    proof.set(challenge.challenge, 9);
    proof.set(digest, HEADER_BYTES);
    return proof;
  }

  async verify(authorKey: Uint8Array, proof: Uint8Array): Promise<boolean> {
    if (proof.length !== HEADER_BYTES + DIGEST_BYTES || proof[0] !== PROOF_VERSION) return false;
    const expiresAtMs = Number(
      new DataView(proof.buffer, proof.byteOffset + 1, 8).getBigUint64(0, false),
    );
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < this.clock.nowMs()) return false;
    if (expiresAtMs > this.clock.nowMs() + this.parameters.ttlMs + 60_000) return false;

    const challenge = proof.slice(9, HEADER_BYTES);
    const expectedChallenge = this.challengeFor(authorKey, expiresAtMs);
    if (!timingSafeEqual(challenge, expectedChallenge)) return false;

    const expectedDigest = await argon2.hash(Buffer.from(challenge).toString('hex'), {
      type: argon2.argon2id,
      salt: Buffer.from(authorKey),
      memoryCost: this.parameters.memoryKiB,
      timeCost: this.parameters.iterations,
      parallelism: this.parameters.parallelism,
      hashLength: DIGEST_BYTES,
      raw: true,
    });
    return timingSafeEqual(proof.slice(HEADER_BYTES), expectedDigest);
  }
}
