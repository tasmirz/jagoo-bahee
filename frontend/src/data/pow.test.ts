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
      boundTo: globalThis.btoa(String.fromCharCode(...authorKey)),
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

  /**
   * The regression: a device clock ahead of the node made a freshly issued challenge look
   * expired, deterministically, so the user could not comment at all and no retry helped.
   */
  it('solves a fresh challenge even when the device clock runs far ahead of the node', async () => {
    const challengeBytes = new Uint8Array(32).fill(1);
    const authorKey = new Uint8Array(32).fill(5);
    const serverNowMs = Date.now() - 45 * 60 * 1000; // device is 45 minutes fast

    await expect(
      solvePow(
        {
          challenge: globalThis.btoa(String.fromCharCode(...challengeBytes)),
          boundTo: globalThis.btoa(String.fromCharCode(...authorKey)),
          memoryKiB: 1024,
          iterations: 2,
          parallelism: 1,
          expiresAtMs: serverNowMs + 5 * 60 * 1000,
          serverNowMs,
        },
        authorKey,
      ),
    ).resolves.toHaveLength(73);
  });

  it('refuses a challenge it has actually held past its lifetime', async () => {
    const challengeBytes = new Uint8Array(32).fill(1);
    const authorKey = new Uint8Array(32).fill(5);
    const serverNowMs = 1_800_000_000_000;

    await expect(
      solvePow(
        {
          challenge: globalThis.btoa(String.fromCharCode(...challengeBytes)),
          boundTo: globalThis.btoa(String.fromCharCode(...authorKey)),
          memoryKiB: 1024,
          iterations: 2,
          parallelism: 1,
          expiresAtMs: serverNowMs + 5 * 60 * 1000,
          serverNowMs,
        },
        authorKey,
        Date.now() - 6 * 60 * 1000,
      ),
    ).rejects.toThrow('expired before it could be solved');
  });

  it('leaves expiry to the node when the challenge carries no issuance instant', async () => {
    const challengeBytes = new Uint8Array(32).fill(1);
    const authorKey = new Uint8Array(32).fill(5);

    // No `serverNowMs`: the client cannot tell skew from staleness, and guessing wrong
    // blocks a user who is not late. The node re-checks expiry when it verifies.
    await expect(
      solvePow(
        {
          challenge: globalThis.btoa(String.fromCharCode(...challengeBytes)),
          boundTo: globalThis.btoa(String.fromCharCode(...authorKey)),
          memoryKiB: 1024,
          iterations: 2,
          parallelism: 1,
          expiresAtMs: 1_000,
        },
        authorKey,
      ),
    ).resolves.toHaveLength(73);
  });

  it('rejects a challenge bound to another registration key', async () => {
    const authorKey = new Uint8Array(32).fill(5);
    await expect(
      solvePow(
        {
          challenge: globalThis.btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
          boundTo: globalThis.btoa(String.fromCharCode(...new Uint8Array(32).fill(6))),
          memoryKiB: 1024,
          iterations: 2,
          parallelism: 1,
          expiresAtMs: 1_900_000_000_000,
        },
        authorKey,
      ),
    ).rejects.toThrow('not bound to this signing key');
  });
});
