import { cryptoBackend } from '@jagoo/sdk/crypto';

export interface PowChallengeJson {
  readonly challenge: string;
  readonly boundTo: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly expiresAtMs: number;
}

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));

const text = new TextEncoder();

/**
 * StatelessArgon2Pow defines its password as the lowercase hex representation of the
 * challenge. Keep this conversion explicit: hashing the decoded challenge bytes produces
 * a valid Argon2id value for a different password and is rejected by the node.
 */
export const powPassword = (challenge: Uint8Array): Uint8Array =>
  text.encode(Array.from(challenge, (byte) => byte.toString(16).padStart(2, '0')).join(''));

/** Produces the exact proof framing verified by StatelessArgon2Pow on the node. */
export async function solvePow(
  challenge: PowChallengeJson,
  authorKey: Uint8Array,
): Promise<Uint8Array> {
  const nowMs = Date.now();
  console.log('[PoW] Challenge received:', {
    challenge: challenge.challenge,
    expiresAtMs: challenge.expiresAtMs,
    memoryKiB: challenge.memoryKiB,
    iterations: challenge.iterations,
    parallelism: challenge.parallelism,
    nowMs,
    remainingSeconds: challenge.expiresAtMs > 0 ? (challenge.expiresAtMs - nowMs) / 1000 : 'unlimited (0)',
  });

  if (challenge.expiresAtMs > 0 && challenge.expiresAtMs <= nowMs) {
    console.error('[PoW] Challenge expired!', {
      expiresAtMs: challenge.expiresAtMs,
      nowMs,
      expiredByMs: nowMs - challenge.expiresAtMs,
    });
    throw new Error(
      `proof-of-work challenge expired (expiresAtMs=${challenge.expiresAtMs}, now=${nowMs})`,
    );
  }
  const challengeBytes = fromBase64(challenge.challenge);
  const boundKey = fromBase64(challenge.boundTo);
  if (
    challengeBytes.length !== 32 ||
    boundKey.length !== authorKey.length ||
    !boundKey.every((byte, index) => byte === authorKey[index])
  ) {
    throw new Error('proof-of-work challenge is not bound to this signing key');
  }
  if (
    !Number.isInteger(challenge.memoryKiB) ||
    challenge.memoryKiB < 8 ||
    !Number.isInteger(challenge.iterations) ||
    challenge.iterations < 1 ||
    !Number.isInteger(challenge.parallelism) ||
    challenge.parallelism < 1
  ) {
    throw new Error('proof-of-work challenge parameters are invalid');
  }
  console.log('[PoW] Solving Argon2id challenge...');
  const hash = cryptoBackend().argon2id(
    powPassword(challengeBytes),
    authorKey,
    {
      // These values are part of the issued challenge. Substituting local minimums creates
      // a perfectly valid Argon2 digest which the issuing node cannot verify.
      memoryKiB: challenge.memoryKiB,
      iterations: challenge.iterations,
      parallelism: challenge.parallelism,
      dkLen: 32,
    },
  );
  console.log('[PoW] Argon2id solved successfully.');
  const proof = new Uint8Array(73);
  proof[0] = 1;
  new DataView(proof.buffer).setBigUint64(1, BigInt(challenge.expiresAtMs), false);
  proof.set(challengeBytes, 9);
  proof.set(hash, 41);
  return proof;
}
