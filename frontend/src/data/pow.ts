import { cryptoBackend } from '@jagoo/sdk/crypto';

export interface PowChallengeJson {
  readonly challenge: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly expiresAtMs: number;
}

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
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
  console.log('[PoW] Solving Argon2id challenge...');
  const hash = cryptoBackend().argon2id(
    challengeBytes,
    authorKey,
    {
      // The dependency-free development node advertises deliberately tiny test values;
      // every backend enforces these portable minimums.
      memoryKiB: Math.max(1024, challenge.memoryKiB),
      iterations: Math.max(2, challenge.iterations),
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
