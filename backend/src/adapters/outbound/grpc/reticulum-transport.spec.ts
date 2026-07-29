import { describe, expect, it } from 'vitest';
import { CheckIn } from '@jagoo/sdk/proto';
import { Plane, Priority } from '../../../core/domain/envelope.js';
import { signEnvelope } from '../../../testing/harness.js';
import { ReachabilityScope } from '../../../core/ports/network.port.js';
import {
  ReticulumTransport,
  TransportUnsupportedError,
  type ReticulumClient,
} from './reticulum-transport.js';

function client(): ReticulumClient & {
  readonly sent: Uint8Array[];
  receivedDestination: string | null;
} {
  const sent: Uint8Array[] = [];
  const value: ReticulumClient & {
    readonly sent: Uint8Array[];
    receivedDestination: string | null;
  } = {
    sent,
    receivedDestination: null as string | null,
    async send(request) {
      sent.push(request.envelope);
      return { accepted: true, code: 0, fragments: 1 };
    },
    async *receive(request: { readonly destination_hash: string }) {
      value.receivedDestination = request.destination_hash;
      yield* [];
    },
    async status() {
      return { interfaces: [], paths: [], queue_depth: 0 };
    },
  };
  return value;
}

describe('optional Reticulum transport adapter', () => {
  it('RG-03 rejects BULK locally before calling the sidecar', async () => {
    const relay = client();
    const transport = new ReticulumTransport('unused', 'destination', relay);
    await expect(
      transport.send(
        signEnvelope({
          plane: Plane.FORUM,
          priority: Priority.BULK,
          domain: 'jb:post:create:v1',
        }),
        { address: 'rns://destination', scope: ReachabilityScope.RETICULUM },
      ),
    ).rejects.toBeInstanceOf(TransportUnsupportedError);
    expect(relay.sent).toHaveLength(0);
  });

  it('forwards an accepted class-2 envelope through the generated bridge client', async () => {
    const relay = client();
    const transport = new ReticulumTransport('unused', 'destination', relay);
    const wire = signEnvelope({
      plane: Plane.SIGNAL,
      priority: Priority.CHECKIN,
      domain: 'jb:checkin:post:v1',
      body: CheckIn.encode(CheckIn.fromPartial({ status: 1 })).finish(),
    });
    await transport.send(wire, {
      address: 'rns://destination',
      scope: ReachabilityScope.RETICULUM,
    });
    expect(relay.sent).toEqual([wire]);
  });

  it('subscribes to the sidecar local destination, not the remote fanout hash', async () => {
    const relay = client();
    const transport = new ReticulumTransport('unused', 'remote-destination', relay);
    const unsubscribe = transport.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(relay.receivedDestination).toBe('');
    unsubscribe();
  });
});
