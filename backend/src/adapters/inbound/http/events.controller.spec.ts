import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../../outbound/in-memory/in-memory-event-bus.js';
import { Plane } from '../../../core/domain/envelope.js';
import type { AcceptedEvent } from '../../../core/ports/events.port.js';
import { EventsController } from './events.controller.js';

const event = (plane: Plane, id: string): AcceptedEvent =>
  ({
    type: 'accepted',
    envelope: {
      plane,
      domain: plane === Plane.FORUM ? 'jb:post:create:v1' : 'jb:broadcast:emit:v1',
      scope: '',
      createdAtMs: 1n,
    },
    receipt: { contentId: id },
  }) as AcceptedEvent;

describe('P4-G8 — one plane per SSE connection', () => {
  it('never emits a Signal envelope on the Forum stream or the reverse', () => {
    const bus = new InMemoryEventBus();
    const controller = new EventsController(bus);
    const forum: string[] = [];
    const signal: string[] = [];
    const forumSubscription = controller.stream().subscribe((message) => forum.push(message.id!));
    const signalSubscription = controller
      .signalStream()
      .subscribe((message) => signal.push(message.id!));

    bus.publish(event(Plane.FORUM, 'forum'));
    bus.publish(event(Plane.SIGNAL, 'signal'));

    expect(forum).toEqual(['forum']);
    expect(signal).toEqual(['signal']);
    forumSubscription.unsubscribe();
    signalSubscription.unsubscribe();
  });
});
