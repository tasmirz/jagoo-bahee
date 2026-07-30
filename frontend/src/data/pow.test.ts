import { cryptoBackend } from '@jagoo/sdk/crypto';
import { powPassword, solvePow, type PowChallengeJson } from './pow';

const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

describe('proof of work', () => {
  it('uses the node protocol lowercase-hex password representation', () => {
    expect(new TextDecoder().decode(powPassword(Uint8Array.from([0, 1, 15, 16, 254, 255])))).toBe(
      '00010f10feff',
    );
  });

  it('creates the exact proof digest verified by StatelessArgon2Pow', async () => {
    const challengeBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const authorKey = new Uint8Array(32).fill(5);
    const challenge: PowChallengeJson = {
      challenge: globalThis.btoa(String.fromCharCode(...challengeBytes)),
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      expiresAtMs: 1_900_000_000_000,
    };

    const proof = await solvePow(challenge, authorKey);
    const expectedDigest = cryptoBackend().argon2id(powPassword(challengeBytes), authorKey, {
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      dkLen: 32,
    });

    expect(proof).toHaveLength(73);
    expect(proof[0]).toBe(1);
    expect(Number(new DataView(proof.buffer).getBigUint64(1, false))).toBe(challenge.expiresAtMs);
    expect(hex(proof.slice(9, 41))).toBe(hex(challengeBytes));
    expect(hex(proof.slice(41))).toBe(hex(expectedDigest));
  });
});
