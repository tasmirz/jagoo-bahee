import { Controller, Inject, Sse, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventBus } from '../../../core/ports/events.port.js';
import { Plane } from '../../../core/domain/envelope.js';

@Controller('v1')
export class EventsController {
  constructor(@Inject(EventBus) private readonly events: EventBus) {}

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return this.streamPlane(Plane.FORUM);
  }

  @Sse('events/signal')
  signalStream(): Observable<MessageEvent> {
    return this.streamPlane(Plane.SIGNAL);
  }

  private streamPlane(plane: Plane): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.events.subscribe((event) => {
        // P4-G8 / AC-13: one SSE connection carries one plane, never a mixed stream.
        if (event.envelope.plane !== plane) return;
        subscriber.next({
          type: event.envelope.domain,
          id: event.receipt.contentId,
          data: {
            contentId: event.receipt.contentId,
            domain: event.envelope.domain,
            scope: event.envelope.scope,
            createdAtMs: Number(event.envelope.createdAtMs),
          },
        });
      });
      return unsubscribe;
    });
  }
}
