import {
  HttpException,
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { RequestSecurity } from '../../../core/ports/request-security.port.js';
import { networkSubjects } from './network-subject.js';

@Injectable()
export class RequestSecurityInterceptor implements NestInterceptor {
  constructor(@Inject(RequestSecurity) private readonly security: RequestSecurity) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const remote = request.raw.socket.remoteAddress ?? request.ip;
    const configured = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
    const trustedHops = Number.isSafeInteger(configured) && configured >= 0 ? configured : 0;
    const forwarded = request.headers['x-forwarded-for'];
    const subjects = networkSubjects(
      remote,
      Array.isArray(forwarded) ? forwarded[0] : forwarded,
      trustedHops,
    );
    try {
      const decision = await this.security.check(subjects);
      if (!decision.allowed) {
        throw new HttpException(
          {
            code: 'RATE_LIMITED',
            detail: decision.blocked ? 'network access is blocked' : 'request rate exceeded',
            retry_after_ms: decision.retryAfterMs,
          },
          429,
        );
      }
      return next.handle();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // AB-07/AUTH-32: limiter failure is closed, never an unlimited bypass.
      throw new HttpException({ code: 'RATE_LIMITED', detail: 'request limiter unavailable' }, 503);
    }
  }
}
