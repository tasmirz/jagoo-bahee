import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { SessionAuth } from '../../../core/ports/auth.port.js';

function bytes(value: unknown, field: string, expected?: number): Uint8Array {
  if (typeof value !== 'string') throw new HttpException({ detail: `${field} is required` }, 400);
  const decoded = new Uint8Array(Buffer.from(value, 'base64'));
  if (decoded.length === 0 || (expected !== undefined && decoded.length !== expected)) {
    throw new HttpException({ detail: `${field} is invalid` }, 400);
  }
  return decoded;
}

function bearer(header: string | undefined): string {
  const [scheme, token] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new HttpException({ detail: 'bearer token is required' }, 401);
  }
  return token;
}

function cookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function refreshCookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `jb_refresh=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/v1/auth; Max-Age=${maxAgeSeconds}${secure}`;
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(SessionAuth) private readonly auth: SessionAuth) {}

  @Get('challenge')
  async challenge(@Query('public_key') publicKey: string): Promise<Record<string, unknown>> {
    try {
      const result = await this.auth.challenge(bytes(publicKey, 'public_key', 32));
      return {
        challenge: Buffer.from(result.challenge).toString('base64'),
        claim: result.claim,
        expiresAtMs: result.expiresAtMs,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: (error as Error).message }, 400);
    }
  }

  @Post()
  async authenticate(
    @Body()
    body: {
      readonly public_key?: string;
      readonly challenge?: string;
      readonly claim?: string;
      readonly signature?: string;
    },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Record<string, unknown>> {
    try {
      const tokens = await this.auth.authenticate(
        bytes(body?.public_key, 'public_key', 32),
        bytes(body?.challenge, 'challenge', 32),
        body?.claim ?? '',
        bytes(body?.signature, 'signature', 64),
      );
      reply.header(
        'set-cookie',
        refreshCookie(
          tokens.refreshToken,
          Math.max(1, Math.floor((tokens.refreshExpiresAtMs - Date.now()) / 1000)),
        ),
      );
      return { ...tokens };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: (error as Error).message }, 401);
    }
  }

  @Post('refresh')
  async refresh(
    @Body() body: { readonly refresh_token?: string } | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Record<string, unknown>> {
    try {
      const refreshToken = body?.refresh_token ?? cookie(cookieHeader, 'jb_refresh');
      if (!refreshToken) throw new Error('refresh_token is required');
      const tokens = await this.auth.refresh(refreshToken);
      reply.header(
        'set-cookie',
        refreshCookie(
          tokens.refreshToken,
          Math.max(1, Math.floor((tokens.refreshExpiresAtMs - Date.now()) / 1000)),
        ),
      );
      return { ...tokens };
    } catch (error) {
      throw new HttpException({ detail: (error as Error).message }, 401);
    }
  }

  @Post('logout')
  async logout(
    @Body() body: { readonly refresh_token?: string } | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    try {
      const refreshToken = body?.refresh_token ?? cookie(cookieHeader, 'jb_refresh');
      if (!refreshToken) throw new Error('refresh_token is required');
      await this.auth.logout(refreshToken);
      reply.header('set-cookie', refreshCookie('', 0));
      return { ok: true };
    } catch (error) {
      throw new HttpException({ detail: (error as Error).message }, 401);
    }
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string): Promise<Record<string, unknown>> {
    try {
      const principal = await this.auth.verifyAccess(bearer(authorization));
      return { key: Buffer.from(principal.key).toString('base64') };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: (error as Error).message }, 401);
    }
  }
}
