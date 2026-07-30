import { describe, expect, it } from 'vitest';
import { ed25519 } from '@jagoo/sdk/crypto';
import { blindCredential, unblindCredential } from '@jagoo/sdk/signer';
import { FixedClock } from '../in-memory/in-memory-stores.js';
import { RealSignatureVerifier } from '../in-memory/real-signature-verifier.js';
import { HmacSessionAuth, authSigningBytes } from './session-auth.js';
import { StatelessArgon2Pow } from './stateless-pow.js';
import { RsaBlindCredentialIssuer } from './rsa-blind-credentials.js';

describe('P1 identity and anti-abuse production primitives', () => {
  it('P1-G7 — a refresh token cannot authenticate as a bearer access token', async () => {
    const clock = new FixedClock(1_700_000_000_000);
    const auth = new HmacSessionAuth(
      new RealSignatureVerifier(),
      clock,
      null,
      Buffer.alloc(32, 1).toString('base64'),
      Buffer.alloc(32, 2).toString('base64'),
    );
    const seed = new Uint8Array(32).fill(7);
    const key = ed25519.derivePublicKey(seed);
    const challenge = await auth.challenge(key);
    const signature = ed25519.sign(
      authSigningBytes(key, challenge.challenge, challenge.claim),
      seed,
    );
    const tokens = await auth.authenticate(key, challenge.challenge, challenge.claim, signature);

    await expect(auth.verifyAccess(tokens.refreshToken)).rejects.toThrow();
    await expect(auth.verifyAccess(tokens.accessToken)).resolves.toMatchObject({ key });
    await expect(auth.refresh(tokens.refreshToken)).resolves.toMatchObject({
      accessToken: expect.any(String),
    });
    await expect(auth.refresh(tokens.refreshToken)).rejects.toThrow(/revoked/);
    await expect(
      auth.authenticate(key, challenge.challenge, challenge.claim, signature),
    ).rejects.toThrow(/already used|expired/);
  });

  it('AUTH-18 — blind issuance cannot be linked to the presented credential', async () => {
    const issuer = RsaBlindCredentialIssuer.generate();
    const token = new Uint8Array(32).fill(11);
    const { blinded, state } = blindCredential(
      await issuer.parameters(),
      token,
      new Uint8Array(256).fill(13),
    );
    const blindSignature = await issuer.issue(blinded);
    const credential = unblindCredential(state, blindSignature);

    expect(Buffer.from(credential.slice(0, 32))).toEqual(Buffer.from(token));
    expect(Buffer.from(credential)).not.toContain(Buffer.from(blinded));
    await expect(issuer.verify(credential)).resolves.toBe(true);
    credential[0] = (credential[0] ?? 0) ^ 1;
    await expect(issuer.verify(credential)).resolves.toBe(false);
  });

  it('P1-G9 — issuing 100,000 PoW challenges retains no per-challenge state', async () => {
    const clock = new FixedClock(1_700_000_000_000);
    const pow = new StatelessArgon2Pow(new Uint8Array(32).fill(4), clock, {
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      ttlMs: 60_000,
    });
    const key = new Uint8Array(32).fill(5);
    const beforeKeys = Object.keys(pow).sort();
    for (let i = 0; i < 100_000; i += 1) await pow.issue(key);
    expect(Object.keys(pow).sort()).toEqual(beforeKeys);

    const challenge = await pow.issue(key);
    const proof = await pow.solve(key, challenge);
    await expect(pow.verify(key, proof)).resolves.toBe(true);
    proof[proof.length - 1] = (proof[proof.length - 1] ?? 0) ^ 1;
    await expect(pow.verify(key, proof)).resolves.toBe(false);
  });

  /**
   * A challenge that publishes only `expiresAtMs` forces the client to compare a server
   * instant against its own clock. A device running fast then rejects a valid challenge
   * outright, and every retry fails identically — the user simply cannot publish.
   */
  it('publishes the issuing clock so a client can measure lifetime without trusting its own clock', async () => {
    const clock = new FixedClock(1_700_000_000_000);
    const pow = new StatelessArgon2Pow(new Uint8Array(32).fill(4), clock, {
      memoryKiB: 1024,
      iterations: 2,
      parallelism: 1,
      ttlMs: 60_000,
    });

    const challenge = await pow.issue(new Uint8Array(32).fill(5));

    expect(challenge.issuedAtMs).toBe(1_700_000_000_000);
    expect(challenge.expiresAtMs - (challenge.issuedAtMs ?? 0)).toBe(60_000);
  });
});
