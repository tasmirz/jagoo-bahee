/**
 * RSA blind credentials (AUTH-18).
 *
 * The issuer receives only a blinded representative. The credential later presented to
 * the node contains a random 32-byte token and its unblinded RSA signature, so issuance
 * and use cannot be linked by the issuer.
 */

import { createHash, generateKeyPairSync } from 'node:crypto';
import { CredentialIssuer } from '../../../core/ports/anti-abuse.port.js';

export interface BlindCredentialPublicKey {
  readonly n: string;
  readonly e: string;
  readonly width: number;
}

export interface RsaPrivateJwk {
  readonly kty: string;
  readonly n: string;
  readonly e: string;
  readonly d: string;
}

function decodeBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function toBigInt(value: Uint8Array): bigint {
  const hex = Buffer.from(value).toString('hex');
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function toBytes(value: bigint, width: number): Uint8Array {
  const hex = value.toString(16).padStart(width * 2, '0');
  if (hex.length > width * 2) throw new Error('integer does not fit RSA modulus');
  return new Uint8Array(Buffer.from(hex, 'hex'));
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

function representative(token: Uint8Array, modulus: bigint): bigint {
  return (
    toBigInt(createHash('sha256').update('jb-blind-credential-v1\0').update(token).digest()) %
    modulus
  );
}

export class RsaBlindCredentialIssuer extends CredentialIssuer {
  private readonly modulus: bigint;
  private readonly publicExponent: bigint;
  private readonly privateExponent: bigint;
  readonly publicKey: BlindCredentialPublicKey;

  constructor(jwk: RsaPrivateJwk) {
    super();
    if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e || !jwk.d) {
      throw new Error('credential signing key must be a private RSA JWK');
    }
    const n = decodeBase64Url(jwk.n);
    this.modulus = toBigInt(n);
    this.publicExponent = toBigInt(decodeBase64Url(jwk.e));
    this.privateExponent = toBigInt(decodeBase64Url(jwk.d));
    this.publicKey = { n: jwk.n, e: jwk.e, width: n.length };
  }

  static generate(): RsaBlindCredentialIssuer {
    return new RsaBlindCredentialIssuer(RsaBlindCredentialIssuer.generateJwk());
  }

  static generateJwk(): RsaPrivateJwk {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
    return pair.privateKey.export({ format: 'jwk' }) as RsaPrivateJwk;
  }

  async issue(blinded: Uint8Array): Promise<Uint8Array> {
    if (blinded.length !== this.publicKey.width) throw new Error('invalid blinded token length');
    const value = toBigInt(blinded);
    if (value <= 0n || value >= this.modulus) throw new Error('invalid blinded token');
    return toBytes(modPow(value, this.privateExponent, this.modulus), this.publicKey.width);
  }

  async verify(credential: Uint8Array): Promise<boolean> {
    const tokenBytes = 32;
    if (credential.length !== tokenBytes + this.publicKey.width) return false;
    const token = credential.slice(0, tokenBytes);
    const signature = toBigInt(credential.slice(tokenBytes));
    if (signature <= 0n || signature >= this.modulus) return false;
    return modPow(signature, this.publicExponent, this.modulus) === representative(token, this.modulus);
  }

  async parameters(): Promise<BlindCredentialPublicKey> {
    return this.publicKey;
  }
}
