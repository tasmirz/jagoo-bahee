import type { ParsedEnvelope } from '../domain/envelope.js';
import type { Receipt } from '../domain/receipt.js';

export interface AcceptedEvent {
  readonly type: 'accepted';
  readonly envelope: ParsedEnvelope;
  readonly receipt: Receipt;
}

export abstract class EventBus {
  abstract publish(event: AcceptedEvent): void;
  abstract subscribe(listener: (event: AcceptedEvent) => void): () => void;
}
