import {
  jsCryptoBackend,
  setCryptoBackend,
  type CryptoBackend,
} from '@jagoo/sdk/crypto';
import { androidCryptoBackend, installedCryptoBackend } from './backend';

export interface CryptoParityCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly durationMs: number;
}

export interface CryptoParityReport {
  readonly candidate: string;
  readonly reference: string;
  readonly available: boolean;
  readonly passed: boolean;
  readonly checks: readonly CryptoParityCheck[];
}

const text = new TextEncoder();

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function check(
  name: string,
  operation: () => boolean,
  detail = 'byte-identical',
): CryptoParityCheck {
  const started = Date.now();
  try {
    const ok = operation();
    return {
      name,
      ok,
      detail: ok ? detail : 'output mismatch',
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : 'native operation failed',
      durationMs: Date.now() - started,
    };
  }
}

/** Deterministic primitive parity; randomness itself is tested for length, never equality. */
export function compareCryptoBackends(
  candidate: CryptoBackend,
  reference: CryptoBackend = jsCryptoBackend,
): CryptoParityReport {
  const message = text.encode('Jagoo Bahee · জাগো বাহে · ADR-017');
  const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const salt = Uint8Array.from({ length: 16 }, (_, index) => 0xa0 + index);
  const aad = text.encode('jb:parity:v1');
  const nonce12 = new Uint8Array(12).fill(7);
  const nonce24 = new Uint8Array(24).fill(9);
  const checks: CryptoParityCheck[] = [];

  checks.push(
    check(
      'CSPRNG contract',
      () => candidate.randomBytes(32).length === 32,
      'native source returned 32 bytes',
    ),
    check('SHA-256', () => equal(candidate.sha256(message), reference.sha256(message))),
    check('SHA-512', () => equal(candidate.sha512(message), reference.sha512(message))),
    check('HMAC-SHA-512', () =>
      equal(candidate.hmacSha512(key, message), reference.hmacSha512(key, message)),
    ),
    check('HKDF-SHA-256', () =>
      equal(
        candidate.hkdfSha256(key, salt, aad, 42),
        reference.hkdfSha256(key, salt, aad, 42),
      ),
    ),
    check('PBKDF2-SHA-512', () =>
      equal(
        candidate.pbkdf2Sha512(message, salt, 128, 64),
        reference.pbkdf2Sha512(message, salt, 128, 64),
      ),
    ),
    check('scrypt', () =>
      equal(
        candidate.scrypt(message, salt, { N: 16, r: 1, p: 1, dkLen: 32 }),
        reference.scrypt(message, salt, { N: 16, r: 1, p: 1, dkLen: 32 }),
      ),
    ),
    check('Argon2id', () =>
      equal(
        candidate.argon2id(message, salt, {
          memoryKiB: 32,
          iterations: 2,
          parallelism: 1,
          dkLen: 32,
        }),
        reference.argon2id(message, salt, {
          memoryKiB: 32,
          iterations: 2,
          parallelism: 1,
          dkLen: 32,
        }),
      ),
    ),
  );

  const candidateEd = candidate.ed25519PublicKey(key);
  const referenceEd = reference.ed25519PublicKey(key);
  const candidateSignature = candidate.ed25519Sign(message, key);
  checks.push(
    check('Ed25519 public key', () => equal(candidateEd, referenceEd)),
    check(
      'Ed25519 signature',
      () =>
        equal(candidateSignature, reference.ed25519Sign(message, key)) &&
        reference.ed25519Verify(candidateSignature, message, candidateEd),
    ),
  );

  const peerSecret = new Uint8Array(32).fill(23);
  const candidatePeer = candidate.x25519PublicKey(peerSecret);
  checks.push(
    check('X25519 public key', () =>
      equal(candidate.x25519PublicKey(key), reference.x25519PublicKey(key)),
    ),
    check('X25519 agreement', () =>
      equal(
        candidate.x25519SharedSecret(key, candidatePeer),
        reference.x25519SharedSecret(key, reference.x25519PublicKey(peerSecret)),
      ),
    ),
  );

  const candidateChaCha = candidate.chacha20poly1305Seal(
    key,
    nonce12,
    message,
    aad,
  );
  checks.push(
    check(
      'ChaCha20-Poly1305',
      () =>
        equal(
          candidateChaCha,
          reference.chacha20poly1305Seal(key, nonce12, message, aad),
        ) &&
        equal(
          candidate.chacha20poly1305Open(key, nonce12, candidateChaCha, aad),
          message,
        ),
    ),
  );

  const candidateXChaCha = candidate.xchacha20poly1305Seal(
    key,
    nonce24,
    message,
    aad,
  );
  checks.push(
    check(
      'XChaCha20-Poly1305',
      () =>
        equal(
          candidateXChaCha,
          reference.xchacha20poly1305Seal(key, nonce24, message, aad),
        ) &&
        equal(
          candidate.xchacha20poly1305Open(key, nonce24, candidateXChaCha, aad),
          message,
        ),
    ),
  );

  const kemSeed = new Uint8Array(64).fill(31);
  const kemRandomness = new Uint8Array(32).fill(41);
  const candidateKem = candidate.mlKem768KeyPair(kemSeed);
  const referenceKem = reference.mlKem768KeyPair(kemSeed);
  const candidateEncapsulation = candidate.mlKem768Encapsulate(
    candidateKem.publicKey,
    kemRandomness,
  );
  const referenceEncapsulation = reference.mlKem768Encapsulate(
    referenceKem.publicKey,
    kemRandomness,
  );
  checks.push(
    check(
      'ML-KEM-768 key generation',
      () =>
        equal(candidateKem.publicKey, referenceKem.publicKey) &&
        equal(candidateKem.secretKey, referenceKem.secretKey),
    ),
    check(
      'ML-KEM-768 encapsulation',
      () =>
        equal(candidateEncapsulation.cipherText, referenceEncapsulation.cipherText) &&
        equal(candidateEncapsulation.sharedSecret, referenceEncapsulation.sharedSecret) &&
        equal(
          candidate.mlKem768Decapsulate(
            candidateEncapsulation.cipherText,
            candidateKem.secretKey,
          ),
          candidateEncapsulation.sharedSecret,
        ),
    ),
  );

  const dsaSeed = new Uint8Array(32).fill(53);
  const candidateDsa = candidate.mlDsa44KeyPair(dsaSeed);
  const referenceDsa = reference.mlDsa44KeyPair(dsaSeed);
  const candidateDsaSignature = candidate.mlDsa44Sign(message, candidateDsa.secretKey);
  checks.push(
    check(
      'ML-DSA-44 key generation',
      () =>
        equal(candidateDsa.publicKey, referenceDsa.publicKey) &&
        equal(candidateDsa.secretKey, referenceDsa.secretKey),
    ),
    check(
      'ML-DSA-44 signature',
      () =>
        equal(
          candidateDsaSignature,
          reference.mlDsa44Sign(message, referenceDsa.secretKey),
        ) &&
        reference.mlDsa44Verify(
          candidateDsaSignature,
          message,
          candidateDsa.publicKey,
        ),
    ),
  );

  candidateKem.secretKey.fill(0);
  referenceKem.secretKey.fill(0);
  candidateDsa.secretKey.fill(0);
  referenceDsa.secretKey.fill(0);

  return {
    candidate: candidate.id,
    reference: reference.id,
    available: true,
    passed: checks.every((item) => item.ok),
    checks,
  };
}

export function runOnDeviceCryptoParity(): CryptoParityReport {
  if (!androidCryptoBackend) {
    return {
      candidate: installedCryptoBackend.id,
      reference: jsCryptoBackend.id,
      available: false,
      passed: false,
      checks: [],
    };
  }
  const report = compareCryptoBackends(androidCryptoBackend);
  // The suite temporarily exercises explicit backends but the application must leave the
  // selected runtime installed even if a comparison fails.
  setCryptoBackend(installedCryptoBackend);
  return report;
}
