import { cryptoBackend } from '@jagoo/sdk/crypto';

export interface PowChallengeJson {
  readonly challenge: string;
  readonly boundTo: string;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  /** Absolute instant on the ISSUING NODE's clock — never comparable to `Date.now()`. */
  readonly expiresAtMs: number;
  /** The node's clock at issuance, when it publishes one. See `solvePow`. */
  readonly serverNowMs?: number;
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

/**
 * Produces the exact proof framing verified by StatelessArgon2Pow on the node.
 *
 * ── Why expiry is measured as a duration, not compared as an instant ────────────────
 * `expiresAtMs` is an instant on the ISSUING NODE's clock. Comparing it to `Date.now()`
 * compares two unsynchronised clocks: a device running more than the challenge's lifetime
 * ahead of the node reads a challenge minted milliseconds ago as already expired, and every
 * retry fails identically because the offset is constant. The symptom is a user who simply
 * cannot publish, reporting an expiry timestamp — with a valid challenge in hand.
 *
 * So the client measures only what one clock can measure honestly: how long IT has held the
 * challenge. `serverNowMs` supplies the node's clock at issuance, so remaining life is
 * `(expiresAtMs − serverNowMs) − elapsedSinceReceipt`, and device skew cancels out.
 *
 * When the node publishes no `serverNowMs`, the client does not guess. The node re-checks
 * expiry when it verifies the proof and is the only party that can do so correctly; refusing
 * here on a comparison known to be invalid would block a user who is not actually late.
 */
export async function solvePow(
  challenge: PowChallengeJson,
  authorKey: Uint8Array,
  /** When the challenge arrived, on the device clock. Defaults to now. */
  receivedAtMs: number = Date.now(),
): Promise<Uint8Array> {
  if (challenge.expiresAtMs > 0 && challenge.serverNowMs !== undefined) {
    const lifetimeMs = challenge.expiresAtMs - challenge.serverNowMs;
    const heldMs = Math.max(0, Date.now() - receivedAtMs);
    if (lifetimeMs <= heldMs) {
      throw new Error(
        `proof-of-work challenge expired before it could be solved (lifetime ${lifetimeMs} ms, held ${heldMs} ms)`,
      );
    }
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
  const proof = new Uint8Array(73);
  proof[0] = 1;
  new DataView(proof.buffer).setBigUint64(1, BigInt(challenge.expiresAtMs), false);
  proof.set(challengeBytes, 9);
  proof.set(hash, 41);
  return proof;
}
