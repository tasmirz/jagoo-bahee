import { EventBus, type AcceptedEvent } from '../../../core/ports/events.port.js';

export class InMemoryEventBus extends EventBus {
  private readonly listeners = new Set<(event: AcceptedEvent) => void>();

  publish(event: AcceptedEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: (event: AcceptedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
