import argon2 from 'react-native-argon2';

export interface PowChallengeJson {
  readonly challenge: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly expiresAtMs: number;
}

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
const fromHex = (value: string): Uint8Array =>
  Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));

/** Produces the exact proof framing verified by StatelessArgon2Pow on the node. */
export async function solvePow(
  challenge: PowChallengeJson,
  authorKey: Uint8Array,
): Promise<Uint8Array> {
  const challengeBytes = fromBase64(challenge.challenge);
  const result = await argon2(
    Array.from(challengeBytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    Array.from(authorKey, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    {
      mode: 'argon2id',
      saltEncoding: 'hex',
      // The dependency-free development node advertises deliberately tiny test values;
      // native Argon2 implementations enforce these portable minimums.
      memory: Math.max(1024, challenge.memoryKiB),
      iterations: Math.max(2, challenge.iterations),
      parallelism: challenge.parallelism,
      hashLength: 32,
    },
  );
  const proof = new Uint8Array(73);
  proof[0] = 1;
  new DataView(proof.buffer).setBigUint64(1, BigInt(challenge.expiresAtMs), false);
  proof.set(challengeBytes, 9);
  proof.set(fromHex(result.rawHash), 41);
  return proof;
}
