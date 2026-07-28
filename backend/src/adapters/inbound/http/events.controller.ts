import { Controller, Inject, Sse, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventBus } from '../../../core/ports/events.port.js';

@Controller('v1')
export class EventsController {
  constructor(@Inject(EventBus) private readonly events: EventBus) {}

  @Sse('events')
  stream(): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const unsubscribe = this.events.subscribe((event) => {
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
