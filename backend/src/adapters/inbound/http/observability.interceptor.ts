import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Observability } from '../../../core/ports/observability.port.js';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(@Inject(Observability) private readonly metrics: Observability) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const route = request.routeOptions?.url ?? 'unmatched';
    return next.handle().pipe(
      tap({
        next: () => this.metrics.request(request.method, route, reply.statusCode),
        error: (error: unknown) => {
          const status =
            typeof error === 'object' &&
            error !== null &&
            'getStatus' in error &&
            typeof error.getStatus === 'function'
              ? Number(error.getStatus())
              : 500;
          this.metrics.request(request.method, route, status);
        },
      }),
    );
  }
}
