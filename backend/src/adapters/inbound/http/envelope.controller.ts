/**
 * T1.7 / WE-01 — `POST /v1/envelopes`, the ONLY write route in the entire system.
 *
 * A post, a vote, a ban, a broadcast, a key revocation: all of it arrives here as a signed
 * envelope. No feature may add a write route. If a feature appears to need one, its
 * registry row or its body schema is wrong.
 *
 * That is not tidiness. One write path means one place where all 19 validation steps run,
 * so there is no second door that skips signature verification — and it is what lets the
 * same pipeline serve HTTP, gRPC federation, mesh and Reticulum without duplicating checks.
 *
 * The controller does no validation of its own. It moves bytes and maps a typed rejection
 * onto an HTTP status. Two validation systems over the same bytes is how the shapes drift.
 */

import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Post,
} from '@nestjs/common';
import { IngressPipeline } from '../../../core/app/ingress.js';
import { EnvelopeRejected, RejectionCode } from '../../../core/domain/errors.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { Envelope } from '@jagoo/sdk/proto';

/**
 * Rejection code → HTTP status.
 *
 * `DUPLICATE` never appears here: the pipeline answers a duplicate with the ORIGINAL
 * receipt and a 200, because a retry arriving over a second transport is normal (ER-01).
 */
const STATUS_BY_CODE: Record<string, number> = {
  [RejectionCode.TOO_LARGE]: 413,
  [RejectionCode.MALFORMED]: 400,
  [RejectionCode.UNKNOWN_VERSION]: 400,
  [RejectionCode.UNKNOWN_DOMAIN]: 400,
  [RejectionCode.PLANE_MISMATCH]: 400,
  [RejectionCode.ALG_NOT_PERMITTED]: 400,
  [RejectionCode.PRIORITY_MISMATCH]: 400,
  [RejectionCode.BODY_INVALID]: 400,
  [RejectionCode.CLOCK_SKEW]: 400,
  [RejectionCode.BAD_SIGNATURE]: 403,
  [RejectionCode.NO_CERTIFICATE]: 403,
  [RejectionCode.KEY_REVOKED]: 403,
  [RejectionCode.FORBIDDEN]: 403,
  [RejectionCode.REPLAY]: 409,
  [RejectionCode.CREDENTIAL_INVALID]: 402,
  [RejectionCode.NULLIFIER_SPENT]: 429,
  [RejectionCode.INSUFFICIENT_CREDITS]: 402,
  [RejectionCode.RATE_LIMITED]: 429,
  [RejectionCode.TRANSPORT_UNSUPPORTED]: 400,
};

export interface EnvelopeRequest {
  /** base64 of the full signed envelope bytes. */
  readonly envelope?: string;
  /** WE-03: batches are homogeneous by plane. */
  readonly envelopes?: readonly string[];
}

@Controller('v1/envelopes')
export class EnvelopeController {
  // Explicit @Inject rather than relying on `emitDecoratorMetadata` (ADR-002). Nest can
  // infer constructor types only when that metadata is emitted, and esbuild — which vitest
  // uses — does not emit it. Naming the token keeps DI identical under both compilers.
  constructor(
    @Inject(IngressPipeline) private readonly pipeline: IngressPipeline,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
  ) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async submit(
    @Body() request: EnvelopeRequest,
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    // Envelopes authenticate themselves, so bearer auth is optional. If a caller sends a
    // token, however, it must be an ACCESS token. This closes the v1 any-JWT guard bug:
    // a seven-day refresh token can never authenticate on a write route (P1-G7).
    if (authorization) {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        throw new HttpException({ detail: 'authorization header is malformed' }, 401);
      }
      try {
        await this.auth.verifyAccess(token);
      } catch {
        throw new HttpException({ detail: 'an access token is required' }, 401);
      }
    }
    const encoded =
      typeof request?.envelope === 'string'
        ? [request.envelope]
        : Array.isArray(request?.envelopes)
          ? request.envelopes
          : [];
    if (
      encoded.length === 0 ||
      encoded.length > 100 ||
      encoded.some((item) => typeof item !== 'string')
    ) {
      throw new HttpException(
        {
          code: RejectionCode.MALFORMED,
          detail: 'provide envelope (base64) or 1-100 envelopes',
        },
        400,
      );
    }

    const raws = encoded.map((item) => this.decodeBase64(item));
    if (raws.length > 1) {
      let planes: Set<number>;
      try {
        planes = new Set(raws.map((raw) => Envelope.decode(raw).plane));
      } catch {
        throw new HttpException(
          { code: RejectionCode.MALFORMED, detail: 'batch contains a malformed envelope' },
          400,
        );
      }
      if (planes.size !== 1) {
        throw new HttpException(
          { code: RejectionCode.PLANE_MISMATCH, detail: 'a batch must not mix planes' },
          400,
        );
      }
    }

    try {
      const receipts = [];
      for (const raw of raws) receipts.push(this.formatReceipt(await this.pipeline.accept(raw)));
      return raws.length === 1 ? receipts[0]! : { receipts };
    } catch (e) {
      if (e instanceof EnvelopeRejected) {
        throw new HttpException(
          {
            code: e.code,
            detail: e.message,
            ...(e.field !== undefined ? { field: e.field } : {}),
            ...(e.retryAfterMs !== undefined ? { retry_after_ms: e.retryAfterMs } : {}),
            ...(e.challenge
              ? {
                  challenge: {
                    challenge: Buffer.from(e.challenge.challenge).toString('base64'),
                    algorithm: e.challenge.algorithm ?? 'argon2id',
                    memory_kib: e.challenge.memoryKiB ?? e.challenge.difficulty,
                    iterations: e.challenge.iterations ?? 1,
                    parallelism: e.challenge.parallelism ?? 1,
                    bound_to: Buffer.from(e.challenge.boundTo ?? new Uint8Array()).toString(
                      'base64',
                    ),
                    expires_at_ms: e.challenge.expiresAtMs,
                  },
                }
              : {}),
          },
          STATUS_BY_CODE[e.code] ?? 400,
        );
      }
      throw e;
    }
  }

  private decodeBase64(encoded: string): Uint8Array {
    if (
      encoded.length === 0 ||
      encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
    ) {
      throw new HttpException({ code: RejectionCode.MALFORMED, detail: 'invalid base64' }, 400);
    }
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.toString('base64') !== encoded) {
      throw new HttpException({ code: RejectionCode.MALFORMED, detail: 'invalid base64' }, 400);
    }
    return new Uint8Array(decoded);
  }

  private formatReceipt(
    receipt: Awaited<ReturnType<IngressPipeline['accept']>>,
  ): Record<string, unknown> {
    return {
      content_id: receipt.contentId,
      log_index: receipt.logIndex,
      leaf_index: receipt.leafIndex,
      accepted_at_ms: receipt.acceptedAtMs,
      server_id: receipt.serverId,
      server_key: Buffer.from(receipt.serverKey).toString('base64'),
      signature: Buffer.from(receipt.signature).toString('base64'),
      sth: {
        tree_size: receipt.sth.treeSize,
        server_key: Buffer.from(receipt.sth.serverKey).toString('base64'),
        root_hash: Buffer.from(receipt.sth.rootHash).toString('base64'),
        timestamp_ms: receipt.sth.timestampMs,
        signature: Buffer.from(receipt.sth.signature).toString('base64'),
      },
      inclusion_proof: receipt.inclusionProof.map((hash) => Buffer.from(hash).toString('base64')),
    };
  }
}
