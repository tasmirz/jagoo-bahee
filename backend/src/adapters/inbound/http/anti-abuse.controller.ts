/**
 * Non-envelope anti-abuse operations. They mint cost and anonymous capability; they do
 * not publish statements, so WE-01 explicitly permits these routes.
 */

import { Body, Controller, Get, Headers, HttpException, Inject, Post, Query } from '@nestjs/common';
import {
  CreditLedger,
  CredentialIssuer,
  PowVerifier,
  type CreditSubject,
} from '../../../core/ports/anti-abuse.port.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';

function decodeBytes(value: unknown, field: string, expected?: number): Uint8Array {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpException({ code: 'MALFORMED', detail: `${field} is required`, field }, 400);
  }
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if ((expected !== undefined && bytes.length !== expected) || bytes.length === 0) {
    throw new HttpException({ code: 'MALFORMED', detail: `${field} is invalid`, field }, 400);
  }
  return bytes;
}

const subjectFor = (authorKey: Uint8Array): CreditSubject => ({
  kind: 'key',
  value: Buffer.from(authorKey).toString('hex'),
});

@Controller('v1')
export class AntiAbuseController {
  constructor(
    @Inject(CreditLedger) private readonly credits: CreditLedger,
    @Inject(CredentialIssuer) private readonly credentials: CredentialIssuer,
    @Inject(PowVerifier) private readonly pow: PowVerifier,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
  ) {}

  @Get('credits')
  async status(@Query('author_key') encodedKey: string): Promise<Record<string, unknown>> {
    const authorKey = decodeBytes(encodedKey, 'author_key', 32);
    const status = await this.credits.consume(subjectFor(authorKey), 0);
    return { remaining: status.remaining, resetAtMs: status.resetAtMs };
  }

  @Post('credits/challenge')
  async challenge(
    @Body() body: { readonly author_key?: string },
  ): Promise<Record<string, unknown>> {
    const authorKey = decodeBytes(body?.author_key, 'author_key', 32);
    const challenge = await this.pow.issue(authorKey);
    return {
      challenge: Buffer.from(challenge.challenge).toString('base64'),
      algorithm: challenge.algorithm ?? 'argon2id',
      memoryKiB: challenge.memoryKiB ?? challenge.difficulty,
      iterations: challenge.iterations ?? 1,
      parallelism: challenge.parallelism ?? 1,
      boundTo: Buffer.from(challenge.boundTo ?? authorKey).toString('base64'),
      expiresAtMs: challenge.expiresAtMs,
    };
  }

  @Post('credits/redeem')
  async redeem(
    @Body() body: { readonly author_key?: string; readonly proof?: string },
  ): Promise<Record<string, unknown>> {
    const authorKey = decodeBytes(body?.author_key, 'author_key', 32);
    const proof = decodeBytes(body?.proof, 'proof');
    const status = await this.credits.redeem(subjectFor(authorKey), {
      challenge: new Uint8Array(0),
      solution: proof,
    });
    if (!status.allowed) {
      throw new HttpException({ code: 'CREDENTIAL_INVALID', detail: 'proof is invalid' }, 403);
    }
    return { remaining: status.remaining, resetAtMs: status.resetAtMs };
  }

  @Get('credentials/parameters')
  async credentialParameters(): Promise<Record<string, unknown>> {
    return this.credentials.parameters();
  }

  @Post('credentials/request')
  async credential(
    @Body() body: { readonly blinded?: string },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'access token is required' }, 401);
    }
    const blinded = decodeBytes(body?.blinded, 'blinded');
    try {
      await this.auth.verifyAccess(token);
    } catch {
      throw new HttpException({ detail: 'access token is invalid' }, 401);
    }
    try {
      const signature = await this.credentials.issue(blinded);
      return { blindSignature: Buffer.from(signature).toString('base64') };
    } catch {
      throw new HttpException(
        { code: 'CREDENTIAL_INVALID', detail: 'blinded credential is invalid' },
        400,
      );
    }
  }
}
