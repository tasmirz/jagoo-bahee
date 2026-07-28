/**
 * Client half of the RSA blind-credential protocol (AUTH-18 / PA-02).
 *
 * Call `blindCredential`, send only `blinded` to the issuer, then pass its response to
 * `unblindCredential`. The final credential is token || signature and reveals neither the
 * blinding factor nor the issuance transcript.
 */

import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, randomBytes } from '@noble/hashes/utils';

export interface BlindCredentialPublicKey {
  readonly n: string;
  readonly e: string;
  readonly width: number;
}

export interface BlindCredentialState {
  readonly token: Uint8Array;
  readonly inverse: Uint8Array;
  readonly publicKey: BlindCredentialPublicKey;
}

const text = new TextEncoder();

function toBigInt(value: Uint8Array): bigint {
  const hex = Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBytes(value: bigint, width: number): Uint8Array {
  const hex = value.toString(16).padStart(width * 2, '0');
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let factor = base % modulus;
  let power = exponent;
  while (power > 0n) {
    if ((power & 1n) === 1n) result = (result * factor) % modulus;
    factor = (factor * factor) % modulus;
    power >>= 1n;
  }
  return result;
}

function extendedGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (a === 0n) return [b, 0n, 1n];
  const [gcd, x, y] = extendedGcd(b % a, a);
  return [gcd, y - (b / a) * x, x];
}

function inverse(value: bigint, modulus: bigint): bigint {
  const [gcd, x] = extendedGcd(value, modulus);
  if (gcd !== 1n) throw new Error('blinding factor is not invertible');
  return ((x % modulus) + modulus) % modulus;
}

function representative(token: Uint8Array, modulus: bigint): bigint {
  return toBigInt(sha256(concatBytes(text.encode('jb-blind-credential-v1\0'), token))) % modulus;
}

export function blindCredential(
  publicKey: BlindCredentialPublicKey,
  token: Uint8Array = randomBytes(32),
  factor: Uint8Array = randomBytes(publicKey.width),
): { blinded: Uint8Array; state: BlindCredentialState } {
  if (token.length !== 32) throw new Error('credential token must be 32 bytes');
  const modulus = toBigInt(fromBase64Url(publicKey.n));
  const exponent = toBigInt(fromBase64Url(publicKey.e));

  let r = (toBigInt(factor) % (modulus - 2n)) + 2n;
  while (true) {
    try {
      const inverseValue = inverse(r, modulus);
      const blinded =
        (representative(token, modulus) * modPow(r, exponent, modulus)) % modulus;
      return {
        blinded: toBytes(blinded, publicKey.width),
        state: {
          token,
          inverse: toBytes(inverseValue, publicKey.width),
          publicKey,
        },
      };
    } catch {
      r = (r + 1n) % modulus;
    }
  }
}

export function unblindCredential(
  state: BlindCredentialState,
  blindSignature: Uint8Array,
): Uint8Array {
  const modulus = toBigInt(fromBase64Url(state.publicKey.n));
  const signature =
    (toBigInt(blindSignature) * toBigInt(state.inverse)) % modulus;
  return concatBytes(state.token, toBytes(signature, state.publicKey.width));
}
