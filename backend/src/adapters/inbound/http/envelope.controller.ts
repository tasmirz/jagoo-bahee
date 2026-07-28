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

import { Body, Controller, Header, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { IngressPipeline } from '../../../core/app/ingress.js';
import { EnvelopeRejected, RejectionCode } from '../../../core/domain/errors.js';

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
  readonly envelope: string;
}

@Controller('v1/envelopes')
export class EnvelopeController {
  // Explicit @Inject rather than relying on `emitDecoratorMetadata` (ADR-002). Nest can
  // infer constructor types only when that metadata is emitted, and esbuild — which vitest
  // uses — does not emit it. Naming the token keeps DI identical under both compilers.
  constructor(@Inject(IngressPipeline) private readonly pipeline: IngressPipeline) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async submit(@Body() request: EnvelopeRequest): Promise<Record<string, unknown>> {
    if (!request?.envelope || typeof request.envelope !== 'string') {
      throw new HttpException(
        { code: RejectionCode.MALFORMED, detail: 'envelope (base64) is required' },
        400,
      );
    }

    let raw: Uint8Array;
    try {
      raw = new Uint8Array(Buffer.from(request.envelope, 'base64'));
    } catch {
      throw new HttpException({ code: RejectionCode.MALFORMED, detail: 'invalid base64' }, 400);
    }

    try {
      const receipt = await this.pipeline.accept(raw);
      return {
        content_id: receipt.contentId,
        log_index: receipt.logIndex,
        accepted_at_ms: receipt.acceptedAtMs,
        server_id: receipt.serverId,
        signature: Buffer.from(receipt.signature).toString('base64'),
        sth: {
          tree_size: receipt.sth.treeSize,
          root_hash: Buffer.from(receipt.sth.rootHash).toString('base64'),
          timestamp_ms: receipt.sth.timestampMs,
          signature: Buffer.from(receipt.sth.signature).toString('base64'),
        },
      };
    } catch (e) {
      if (e instanceof EnvelopeRejected) {
        throw new HttpException(
          {
            code: e.code,
            detail: e.message,
            ...(e.field !== undefined ? { field: e.field } : {}),
            ...(e.retryAfterMs !== undefined ? { retry_after_ms: e.retryAfterMs } : {}),
          },
          STATUS_BY_CODE[e.code] ?? 400,
        );
      }
      throw e;
    }
  }
}
