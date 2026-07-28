import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import {
  SessionAuth,
  type AccessPrincipal,
  type AuthChallenge,
  type SessionTokens,
} from '../../../core/ports/auth.port.js';
import type { SignatureVerifier } from '../../../core/ports/identity.port.js';
import type { Clock } from '../../../core/ports/system.port.js';
import { KeyAlg } from '../../../core/domain/envelope.js';

const text = new TextEncoder();

interface Claims {
  readonly typ: 'access' | 'refresh';
  readonly sub: string;
  readonly jti: string;
  readonly exp: number;
}

export function authSigningBytes(
  key: Uint8Array,
  challenge: Uint8Array,
  claim: 'login',
): Uint8Array {
  const prefix = text.encode(`jb-auth-v1\0${claim}\0`);
  const out = new Uint8Array(prefix.length + key.length + challenge.length);
  out.set(prefix);
  out.set(key, prefix.length);
  out.set(challenge, prefix.length + key.length);
  return out;
}

function parseSecret(value: string | undefined, label: string): Uint8Array {
  if (!value) {
    return new Uint8Array(
      createHmac('sha256', 'jagoo-local-development-only').update(label).digest(),
    );
  }
  const secret = new Uint8Array(Buffer.from(value, 'base64'));
  if (secret.length < 32) throw new Error(`${label} must contain at least 32 bytes`);
  return secret;
}

export class HmacSessionAuth extends SessionAuth {
  private readonly accessSecret: Uint8Array;
  private readonly refreshSecret: Uint8Array;
  private readonly issued = new Map<string, number>();
  private readonly revoked = new Map<string, number>();

  constructor(
    private readonly verifier: SignatureVerifier,
    private readonly clock: Clock,
    private readonly redis: Redis | null,
    accessSecret?: string,
    refreshSecret?: string,
    private readonly challengeTtlMs = 2 * 60 * 1000,
    private readonly accessTtlMs = 15 * 60 * 1000,
    private readonly refreshTtlMs = 7 * 24 * 60 * 60 * 1000,
  ) {
    super();
    this.accessSecret = parseSecret(accessSecret, 'AUTH_ACCESS_SECRET');
    this.refreshSecret = parseSecret(refreshSecret, 'AUTH_REFRESH_SECRET');
    if (timingSafeEqual(this.accessSecret, this.refreshSecret)) {
      throw new Error('access and refresh token signing keys must be different');
    }
  }

  private challengeKey(key: Uint8Array, challenge: Uint8Array): string {
    return `jb:auth:challenge:${Buffer.from(key).toString('hex')}:${Buffer.from(challenge).toString('hex')}`;
  }

  async challenge(key: Uint8Array): Promise<AuthChallenge> {
    if (key.length !== 32) throw new Error('public key must be 32 bytes');
    const challenge = new Uint8Array(randomBytes(32));
    const expiresAtMs = this.clock.nowMs() + this.challengeTtlMs;
    const cacheKey = this.challengeKey(key, challenge);
    if (this.redis) {
      await this.redis.set(cacheKey, String(expiresAtMs), 'PX', this.challengeTtlMs);
    } else {
      this.issued.set(cacheKey, expiresAtMs);
    }
    return { challenge, claim: 'login', expiresAtMs };
  }

  private async consumeChallenge(key: Uint8Array, challenge: Uint8Array): Promise<boolean> {
    const cacheKey = this.challengeKey(key, challenge);
    if (this.redis) return (await this.redis.getdel(cacheKey)) !== null;
    const expires = this.issued.get(cacheKey);
    this.issued.delete(cacheKey);
    return expires !== undefined && expires >= this.clock.nowMs();
  }

  async authenticate(
    key: Uint8Array,
    challenge: Uint8Array,
    claim: string,
    signature: Uint8Array,
  ): Promise<SessionTokens> {
    if (claim !== 'login') throw new Error('unsupported auth claim');
    if (
      !this.verifier.verify(
        KeyAlg.ED25519,
        key,
        authSigningBytes(key, challenge, 'login'),
        signature,
      )
    ) {
      throw new Error('authentication signature is invalid');
    }
    if (!(await this.consumeChallenge(key, challenge))) {
      throw new Error('authentication challenge is expired or already used');
    }
    return this.mint(Buffer.from(key).toString('hex'));
  }

  private sign(claims: Claims, secret: Uint8Array): string {
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  private verify(token: string, expected: Claims['typ'], secret: Uint8Array): Claims {
    const [body, encodedSignature, extra] = token.split('.');
    if (!body || !encodedSignature || extra) throw new Error('token is malformed');
    const expectedSignature = createHmac('sha256', secret).update(body).digest();
    const signature = Buffer.from(encodedSignature, 'base64url');
    if (
      signature.length !== expectedSignature.length ||
      !timingSafeEqual(signature, expectedSignature)
    ) {
      throw new Error('token signature is invalid');
    }
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Claims>;
    if (claims.typ !== expected) throw new Error(`expected a ${expected} token`);
    if (!claims.sub || !claims.jti || !claims.exp || claims.exp < this.clock.nowMs()) {
      throw new Error('token is expired or incomplete');
    }
    return claims as Claims;
  }

  private mint(subject: string): SessionTokens {
    const now = this.clock.nowMs();
    const access: Claims = {
      typ: 'access',
      sub: subject,
      jti: randomBytes(16).toString('hex'),
      exp: now + this.accessTtlMs,
    };
    const refresh: Claims = {
      typ: 'refresh',
      sub: subject,
      jti: randomBytes(16).toString('hex'),
      exp: now + this.refreshTtlMs,
    };
    return {
      accessToken: this.sign(access, this.accessSecret),
      refreshToken: this.sign(refresh, this.refreshSecret),
      accessExpiresAtMs: access.exp,
      refreshExpiresAtMs: refresh.exp,
    };
  }

  async verifyAccess(accessToken: string): Promise<AccessPrincipal> {
    const claims = this.verify(accessToken, 'access', this.accessSecret);
    return { key: new Uint8Array(Buffer.from(claims.sub, 'hex')), tokenId: claims.jti };
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    const claims = this.verify(refreshToken, 'refresh', this.refreshSecret);
    if (await this.isRevoked(claims.jti)) throw new Error('refresh token is revoked');
    await this.revoke(claims);
    return this.mint(claims.sub);
  }

  private async isRevoked(tokenId: string): Promise<boolean> {
    if (this.redis) return (await this.redis.exists(`jb:auth:revoked:${tokenId}`)) === 1;
    const expiry = this.revoked.get(tokenId);
    if (expiry !== undefined && expiry < this.clock.nowMs()) this.revoked.delete(tokenId);
    return expiry !== undefined && expiry >= this.clock.nowMs();
  }

  async logout(refreshToken: string): Promise<void> {
    const claims = this.verify(refreshToken, 'refresh', this.refreshSecret);
    await this.revoke(claims);
  }

  private async revoke(claims: Claims): Promise<void> {
    const ttl = Math.max(1, claims.exp - this.clock.nowMs());
    if (this.redis) {
      await this.redis.set(`jb:auth:revoked:${claims.jti}`, '1', 'PX', ttl);
    } else {
      this.revoked.set(claims.jti, claims.exp);
    }
  }
}
